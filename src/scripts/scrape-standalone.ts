import 'dotenv/config';

// FAIL FAST: Ensure we are connecting to the real DB in production/CI
if (!process.env.TURSO_DATABASE_URL && process.env.CI) {
    console.error("CRITICAL ERROR: TURSO_DATABASE_URL is not set in CI environment!");
    console.error("The scraper would otherwise write to a temporary local file and data would be lost.");
    process.exit(1);
}

import * as cheerio from 'cheerio';
import { insertArticles, deleteOldArticles, deleteInvalidArticles, getAllLinks, Article } from '../lib/db';
import { rateLimitedFetch } from '../lib/rate-limited-fetch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Calculate similarity between two titles (0-1 scale)
function titleSimilarity(title1: string, title2: string): number {
    const normalize = (s: string) => s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const t1 = normalize(title1);
    const t2 = normalize(title2);

    // Quick exact match check
    if (t1 === t2) return 1.0;

    // Word-based similarity (Jaccard similarity)
    const words1 = new Set(t1.split(' ').filter(w => w.length > 2)); // Ignore short words
    const words2 = new Set(t2.split(' ').filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

interface Story {
    id: string;
    source: string;
    title: string;
    link: string;
    image: string | null;
    time: string;
    timestamp: number;
    section?: string;
    content?: string;
}

// Check if a story is a duplicate based on title similarity
function isDuplicateStory(newStory: Story, existingStories: Story[], threshold = 0.7): boolean {
    return existingStories.some(existing => {
        const similarity = titleSimilarity(newStory.title, existing.title);
        return similarity >= threshold;
    });
}

function resolveUrl(base: string, relative: string): string {
    try {
        return new URL(relative, base).href;
    } catch {
        return relative;
    }
}

// Parse publication date from various formats
function parsePublicationDate(dateStr: string): { timestamp: number; display: string } {
    if (!dateStr || dateStr.trim() === '') {
        return { timestamp: Date.now(), display: 'Recent' };
    }

    let cleaned = dateStr.trim();

    // All Ghana news sources use GMT. If the date string doesn't have explicit timezone info,
    // append GMT to ensure correct parsing regardless of the scraper's local timezone.
    const hasTimezone = /GMT|UTC|Z|[+-]\d{2}:?\d{2}/.test(cleaned);

    if (!hasTimezone) {
        cleaned += ' GMT';
    }

    const d = new Date(cleaned);

    console.log(`[DEBUG DATE] Input: ${dateStr}, Adjusted: ${cleaned}, Parsed: ${d.toString()}`);

    if (!isNaN(d.getTime())) {
        const timestamp = d.getTime();
        const display = d.toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            month: 'short',
            day: 'numeric'
        });
        return { timestamp, display };
    }

    // If we can't parse it, return current time
    return { timestamp: Date.now(), display: 'Recent' };
}

function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    let interval = seconds / 31536000; // years
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000; // months
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400; // days
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600; // hours
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60; // minutes
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}


// Fallback: Fetch article page to find og:image and parsing date
export async function fetchArticleMetadata(link: string, source?: string): Promise<{ image: string | null, timestamp?: number, time?: string, content?: string }> {
    try {
        // Special handling for PeaceFM API
        if (source === 'PeaceFM' || link.includes('peacefmonline.com')) {
            // Extract ID. format: /.../.../123456-some-slug
            // Or new format /article/123456-some-slug
            const idMatch = link.match(/(\d+)-/);
            if (idMatch) {
                const id = idMatch[1];
                const apiUrl = `https://articles-engine.peacefmonline.com/v1/articles/${id}`;
                const res = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (res.ok) {
                    const json = await res.json();
                    if (json.status === 'success' && json.data) {
                        const d = json.data;
                        return {
                            image: d.main_photo?.photo_url || null,
                            timestamp: new Date(d.created_at).getTime(),
                            time: timeAgo(new Date(d.created_at).getTime()),
                            content: d.main_description // This is HTML
                        };
                    }
                }
            }
        }

        const res = await rateLimitedFetch(link, { skipCache: true });
        if (!res.ok) {
            console.error(`[DEBUG] Fetch failed for ${link}: ${res.status} ${res.statusText}`);
            return { image: null };
        }
        const html = await res.text();
        const $ = cheerio.load(html);

        // Image
        const image = $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content') ||
            null;

        // Date
        let dateStr = $('meta[property="og:article:published_time"]').attr('content') ||
            $('meta[property="article:published_time"]').attr('content') ||
            $('meta[name="article:published_time"]').attr('content') ||
            $('meta[property="og:updated_time"]').attr('content') ||
            $('meta[property="article:modified_time"]').attr('content') ||
            $('meta[itemprop="datePublished"]').attr('content') ||
            $('meta[name="pubdate"]').attr('content') ||
            $('#date').text() ||
            $('time').first().attr('datetime') ||
            // MyJoyOnline specific deep-fetch selectors
            $('meta[name="publish-date"]').attr('content');

        // GhanaWeb: Prioritize article:published_time as requested by user
        if (source === 'GhanaWeb') {
            const gwDate = $('meta[property="article:published_time"]').attr('content');
            console.log(`[DEBUG GW] Tag found: ${gwDate}`);
            if (gwDate) dateStr = gwDate;
        }

        // MyJoyOnline-specific date extraction from HTML text (listing page or fallback)
        if (!dateStr && source === 'MyJoyOnline') {
            dateStr = $('.post-date, .entry-date, .published, .article-date').first().text().trim() ||
                $('.meta-info time').text().trim() ||
                $('span[class*="date"]').first().text().trim();
        }

        // GhanaWeb-specific date extraction from page text
        if (!dateStr && source === 'GhanaWeb') {
            dateStr = $('.date, .story-date, .article-date, .published-date').first().text().trim();
            if (!dateStr) {
                const bodyText = $('body').text();
                const dateMatch = bodyText.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
                if (dateMatch) {
                    dateStr = dateMatch[0];
                }
            }
        }

        let timestamp: number | undefined;
        let time: string | undefined;

        if (dateStr) {
            const parsed = parsePublicationDate(dateStr);

            if (parsed.display !== 'Recent') {
                timestamp = parsed.timestamp;
                time = parsed.display;
            }
        }

        // Robust Content Extraction
        const robustSelectors = [
            '#article-body', '.article-body', '.story-content', '.content-body',
            '.post-content', '.entry-content', 'article', '#main-content',
            '.news-content', '.item-content', '[itemprop="articleBody"]',
            '.td-post-content', '#article-text', '.prose'
        ];

        // Add source specific selectors to the front
        if (source === 'GhanaWeb') robustSelectors.unshift('#medsection1', '.article-content-area');
        if (source === '3News') robustSelectors.unshift('.prose');

        let content: string | undefined;

        for (const selector of robustSelectors) {
            const el = $(selector).first();
            if (el.length > 0) {
                // Remove unwanted elements
                el.find('script, style, iframe, .ad, .advertisement, .related-articles, .related-posts, .ads').remove();

                const htmlContent = el.html();
                if (htmlContent && htmlContent.length > 50) {
                    // Basic cleanup of paragraphs
                    const cleanHtml: string[] = [];
                    el.find('p').each((_, p) => {
                        const t = $(p).text().trim();
                        if (t.length > 20) cleanHtml.push(`<p>${t}</p>`);
                    });

                    if (cleanHtml.length > 0) content = cleanHtml.join('');
                    else content = htmlContent.trim(); // Fallback to raw HTML if p parsing fails

                    break;
                }
            }
        }

        // Fallback for tricky sites (like GhanaWeb unstructured)
        if (!content && source === 'GhanaWeb') {
            const pBlocks = $('p').parent().filter((i, el) => $(el).find('p').length > 3).first();
            if (pBlocks.length) {
                const paragraphs: string[] = [];
                pBlocks.find('p').each((_, el) => {
                    const text = $(el).text().trim();
                    if (text.length > 20) paragraphs.push(`<p>${text}</p>`);
                });
                if (paragraphs.length) content = paragraphs.join('');
            }
        }

        return {
            image: image || null,
            timestamp,
            time,
            content: content
        };

    } catch (e) {
        console.error('Error fetching metadata:', e);
        return { image: null };
    }
}

// ---------------------------------------------------------------------------
// Source: GhanaWeb (Scrape Sections)
// ---------------------------------------------------------------------------
async function scrapeGhanaWeb(): Promise<Story[]> {
    const sections = [
        { name: 'News', url: 'https://www.ghanaweb.com/GhanaHomePage/NewsArchive/' },
        { name: 'Sports', url: 'https://www.ghanaweb.com/GhanaHomePage/SportsArchive/' },
        { name: 'Entertainment', url: 'https://www.ghanaweb.com/GhanaHomePage/entertainment/' },
        { name: 'Politics', url: 'https://www.ghanaweb.com/GhanaHomePage/politics/' }
    ];

    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    await Promise.all(sections.map(async (sec) => {
        try {
            const res = await rateLimitedFetch(sec.url, { skipCache: true });
            const html = await res.text();
            const $ = cheerio.load(html);

            // Generic Link Scanner for GhanaWeb (since structure changes frequently)
            const links = $('a[href*="/GhanaHomePage/"]');

            let count = 0;

            links.each((_, el) => {
                if (count >= 20) return false; // Stop after 20 valid articles per section

                const a = $(el);
                const link = a.attr('href');
                let title = a.attr('title') || a.text().trim();

                if (!link || !title || title.length < 10) return;

                // Expand weird relative links if needed, though they usually start with /
                const fullLink = resolveUrl('https://www.ghanaweb.com', link);

                // Filter out Landing Pages and known non-article sections
                const ignoredPaths = [
                    '/GhanaHomePage/NewsArchive/', '/GhanaHomePage/SportsArchive/',
                    '/GhanaHomePage/business/', '/GhanaHomePage/opinion/',
                    '/GhanaHomePage/entertainment/', '/GhanaHomePage/africa/',
                    '/GhanaHomePage/crime/', '/GhanaHomePage/health/',
                    '/GhanaHomePage/regional/', '/GhanaHomePage/religion/',
                    '/GhanaHomePage/diaspora/', '/GhanaHomePage/politics/',
                    '/GhanaHomePage/'
                ];

                // Check if exact match to ignored path
                const path = new URL(fullLink).pathname;
                if (ignoredPaths.includes(path) || path === '/GhanaHomePage/') return;

                // Additional filter: Article URLs usually have more segments or end in .php or digits
                // If it looks like a category landing page (e.g. /GhanaHomePage/NewsArchive/), skip
                if (ignoredPaths.some(p => fullLink.includes(p) && fullLink.endsWith('/'))) return;

                // Unwanted Titles
                const unwantedTitlePatterns = [
                    'Home - News', 'Home - Business', 'Home - Sports', 'Home-Business',
                    'Business archive', 'News Archive', 'Sports Archive', 'Photo Archives',
                    'Archive', 'Category:', 'Section:', 'More News', 'More Stories',
                    'View All', 'Latest News', 'Top Stories', 'Click here', 'Read more'
                ];
                const isUnwantedTitle = unwantedTitlePatterns.some(pattern =>
                    title.toLowerCase().trim() === pattern.toLowerCase() ||
                    title.toLowerCase().includes(pattern.toLowerCase())
                );
                if (isUnwantedTitle) return;

                if (seenLinks.has(fullLink)) return;
                seenLinks.add(fullLink);

                // Try to find image nearby
                // STRICT MODE: Only look for image inside the anchor tag. 
                // Do NOT look in parent containers as this leads to wrong images for text-only links in shared containers.
                let image = a.find('img').attr('src');

                if (image) image = resolveUrl('https://cdn.ghanaweb.com', image);
                if (image?.endsWith('.svg')) image = undefined;

                stories.push({
                    id: `gw-${Math.random().toString(36).substring(2, 9)}`,
                    source: 'GhanaWeb',
                    title,
                    link: fullLink,
                    image: image || null,
                    time: '', // Don't show date since we can't extract it reliably
                    timestamp: Date.now(), // Used for sorting only
                    section: sec.name
                });
                count++;
            });
        } catch (e) {
            console.error(`GhanaWeb ${sec.name} Error:`, e);
        }
    }));

    return stories;
}

// ---------------------------------------------------------------------------
// Source: AdomOnline (RSS Sections)
// ---------------------------------------------------------------------------
async function scrapeAdomOnline(): Promise<Story[]> {
    const feeds = [
        { name: 'News', url: 'https://www.adomonline.com/category/news/feed/' },
        { name: 'Sports', url: 'https://www.adomonline.com/category/sports/feed/' },
        { name: 'Business', url: 'https://www.adomonline.com/category/business/feed/' }
    ];

    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    await Promise.all(feeds.map(async (feed) => {
        try {
            const res = await rateLimitedFetch(feed.url, { skipCache: true });
            const xml = await res.text();
            const $ = cheerio.load(xml, { xmlMode: true });

            $('item').slice(0, 5).each((_, el) => {
                const title = $(el).find('title').text().trim();
                const link = $(el).find('link').text().trim();
                const pubDate = $(el).find('pubDate').text().trim();

                if (seenLinks.has(link)) return;
                seenLinks.add(link);

                let timestamp = Date.now();
                let timeDisplay = 'Recent';
                if (pubDate) {
                    const d = new Date(pubDate);
                    if (!isNaN(d.getTime())) {
                        timestamp = d.getTime();
                        timeDisplay = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
                    }
                }

                let image = $(el).find('media\\:content').attr('url') ||
                    $(el).find('media\\:thumbnail').attr('url');

                if (!image) {
                    const content = $(el).find('content\\:encoded').text();
                    const match = content.match(/src="([^"]+)"/);
                    if (match) image = match[1];
                }

                stories.push({
                    id: `adom-${stories.length + Math.random()}`,
                    source: 'AdomOnline',
                    title,
                    link,
                    image: image || null,
                    time: timeDisplay,
                    timestamp,
                    section: feed.name
                });
            });
        } catch (e) {
            console.error(`AdomOnline ${feed.name} Error:`, e);
        }
    }));

    return stories;
}

// ---------------------------------------------------------------------------
// Source: PeaceFM (API)
// ---------------------------------------------------------------------------
async function scrapePeaceFM(): Promise<Story[]> {
    try {
        const response = await rateLimitedFetch('https://articles-engine.peacefmonline.com/v1/articles?limit=30', { skipCache: true });
        if (!response.ok) return [];

        const json = await response.json() as any;
        if (json.status !== 'success' || !json.data) return [];

        const articles = json.data.map((item: any) => {
            // Correct PeaceFM URL format: https://www.peacefmonline.com/article/ID-slug
            const link = `https://www.peacefmonline.com/article/${item.article_id}-${item.slug}`;

            return {
                id: `peace-${item.article_id}`, // Use actual ID for stability
                source: 'PeaceFM',
                title: item.main_title,
                link: link,
                image: item.main_photo?.photo_url || null,
                time: timeAgo(new Date(item.created_at).getTime()),
                section: item.section?.name || item.section?.section_name || 'News',
                timestamp: new Date(item.created_at).getTime(),
                content: item.main_description // Use description as fallback content
            };
        });

        return articles.filter((a: any) => a.title && a.link);
    } catch (error) {
        console.error('Error scraping PeaceFM API:', error);
        console.log('Falling back to PeaceFM HTML scraping...');
        return scrapePeaceFM_HTML();
    }
}

async function scrapePeaceFM_HTML(): Promise<Story[]> {
    const sectionMap: Record<string, number> = {
        'Politics': 5,
        'News': 1, // Local News
        'Business': 3,
        'Showbiz': 4,
        'Sports': 2
    };

    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    console.log('SCRAPER: Starting PeaceFM API (Sections) scrape...');

    for (const [sectionName, sectionId] of Object.entries(sectionMap)) {
        try {
            console.log(`PeaceFM: Fetching ${sectionName} (ID: ${sectionId})...`);
            const listRes = await rateLimitedFetch(`https://articles-engine.peacefmonline.com/v1/articles?section_id=${sectionId}&limit=30`, { skipCache: true });

            if (!listRes.ok) {
                console.error(`PeaceFM: Failed to fetch ${sectionName}. Status: ${listRes.status}`);
                continue;
            }

            const listData = await listRes.json() as any;
            const items = listData.data || [];

            console.log(`PeaceFM: Found ${items.length} items in ${sectionName}. Fetching details...`);

            // Fetch details for each item to get content
            for (const item of items) {
                try {


                    if (!item.article_id) continue;

                    const detailRes = await rateLimitedFetch(`https://articles-engine.peacefmonline.com/v1/articles/${item.article_id}`, { skipCache: true });

                    if (!detailRes.ok) {
                        console.error(`PeaceFM: Failed to fetch article ${item.article_id}`);
                        continue;
                    }

                    const detailJson = await detailRes.json() as any;
                    const fullItem = detailJson.data;

                    if (!fullItem) continue;

                    // Use provided article_url or fallback
                    const link = fullItem.article_url || `https://www.peacefmonline.com/pages/${sectionName.toLowerCase()}/${fullItem.slug}.php`;

                    if (seenLinks.has(link)) continue;
                    seenLinks.add(link);

                    // Image extraction
                    // main_photo is object: { id, photo_url, caption }
                    let image = null;
                    if (fullItem.main_photo && typeof fullItem.main_photo === 'object' && fullItem.main_photo.photo_url) {
                        image = fullItem.main_photo.photo_url;
                    } else if (typeof fullItem.main_photo === 'string') {
                        image = fullItem.main_photo;
                    }

                    // Content
                    const content = fullItem.main_description || fullItem.main_summary || '';

                    // Date
                    const timestamp = new Date(fullItem.created_at).getTime();

                    stories.push({
                        id: `peace-${fullItem.article_id}`,
                        source: 'PeaceFM',
                        title: fullItem.main_title,
                        link: link,
                        image: image,
                        time: timeAgo(timestamp),
                        timestamp: timestamp,
                        section: sectionName,
                        content: content
                    });
                } catch (err) {
                    console.error(`PeaceFM: Error fetching detail for ${item.article_id}`, err);
                }
            }

        } catch (e) {
            console.error(`PeaceFM API ${sectionName} error:`, e);
        }
    }

    console.log(`PeaceFM: Total stories scraped: ${stories.length}`);
    return stories;
}

// ---------------------------------------------------------------------------
// Source: MyJoyOnline (HTML Scrape Sections)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Source: MyJoyOnline (RSS Feed)
// ---------------------------------------------------------------------------
async function scrapeMyJoyOnline(): Promise<Story[]> {
    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    try {
        const res = await rateLimitedFetch('https://www.myjoyonline.com/feed/', { skipCache: true });
        if (!res.ok) throw new Error(`MyJoyOnline RSS failed: ${res.status}`);

        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        $('item').slice(0, 15).each((_, el) => {
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();

            if (seenLinks.has(link)) return;
            seenLinks.add(link);

            let timestamp = Date.now();
            let timeDisplay = 'Recent';

            if (pubDate) {
                const parsed = parsePublicationDate(pubDate);
                timestamp = parsed.timestamp;
                timeDisplay = parsed.display;
            }

            let image = $(el).find('media\\:content').attr('url') ||
                $(el).find('media\\:thumbnail').attr('url');

            // Fallback image extraction from content:encoded
            if (!image) {
                const content = $(el).find('content\\:encoded').text();
                const match = content.match(/src="([^"]+)"/);
                if (match) image = match[1];
            }

            // Determine section from category tags
            let section = 'News';
            const categories: string[] = [];
            $(el).find('category').each((_, cat) => {
                categories.push($(cat).text().toLowerCase());
            });

            if (categories.some(c => c.includes('sport') || c.includes('football'))) section = 'Sports';
            else if (categories.some(c => c.includes('business') || c.includes('economy'))) section = 'Business';
            else if (categories.some(c => c.includes('entertainment') || c.includes('showbiz'))) section = 'Entertainment';

            stories.push({
                id: `joy-${stories.length + Math.random()}`,
                source: 'MyJoyOnline',
                title,
                link,
                image: image || null,
                time: timeDisplay,
                timestamp,
                section
            });
        });
    } catch (e) {
        console.error('MyJoyOnline RSS Error:', e);
    }

    return stories;
}




// ---------------------------------------------------------------------------
// Source: Generic RSS Scraper
// ---------------------------------------------------------------------------
const GENERIC_FEEDS = [
    { source: '3News', url: 'https://3news.com/feed/', section: 'News' },


    { source: 'DailyGuide', url: 'https://dailyguidenetwork.com/feed/', section: 'News' },
    { source: 'CitiNewsRoom', url: 'https://citinewsroom.com/feed/', section: 'News' },
    { source: 'Modern Ghana', url: 'https://www.modernghana.com/rssfeed/news.xml', section: 'News' },
    { source: 'GNA', url: 'https://gna.org.gh/feed/', section: 'News' },
    { source: 'Graphic Online', url: 'https://www.graphic.com.gh/news/general-news?format=feed', section: 'News' },
    { source: 'Ghanaian Times', url: 'https://www.ghanaiantimes.com.gh/feed/', section: 'News' },
    { source: 'Starr FM', url: 'https://starrfm.com.gh/feed/', section: 'News' },

    { source: 'The B&FT', url: 'https://thebftonline.com/feed/', section: 'Business' },
    { source: 'Atinka Online', url: 'https://atinkaonline.com/feed/', section: 'News' },
    { source: 'Asaase Radio', url: 'https://asaaseradio.com/feed/', section: 'News' },
    { source: 'The Herald', url: 'https://theheraldghana.com/feed/', section: 'News' },
    { source: 'The Chronicle', url: 'https://thechronicle.com.gh/feed/', section: 'News' },
    { source: 'GhPage', url: 'https://ghpage.com/feed/', section: 'Entertainment' },
    { source: 'Ameyaw Debrah', url: 'https://ameyawdebrah.com/feed/', section: 'Entertainment' },
    { source: 'YFM Ghana', url: 'https://yfmghana.com/feed/', section: 'Entertainment' },
    { source: 'Happy Ghana', url: 'https://www.happyghana.com/feed/', section: 'News' },
    { source: 'ZionFelix', url: 'https://www.zionfelix.net/feed/', section: 'Entertainment' },
    { source: 'Nkonkonsa', url: 'https://nkonkonsa.com/feed/', section: 'Entertainment' }
];






async function scrapeGhanaSoccerNet(): Promise<Story[]> {
    const stories: Story[] = [];
    const source = 'GhanaSoccerNet';
    const section = 'Sports';

    try {
        console.log(`SCRAPER: Fetching ${source} RSS feed...`);
        const res = await rateLimitedFetch('https://ghanasoccernet.com/feed', { skipCache: true });

        if (!res.ok) {
            console.error(`${source}: Failed to fetch RSS feed. Status: ${res.status}`);
            return [];
        }

        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const items = $('item').toArray();

        // Limit to 20 items to match other sources
        const recentItems = items.slice(0, 20);

        console.log(`${source}: Found ${recentItems.length} items. Fetching details...`);

        for (const el of recentItems) {
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();

            if (!link) continue;

            let timestamp = Date.now();
            let timeDisplay = 'Recent';
            if (pubDate) {
                const parsed = parsePublicationDate(pubDate);
                timestamp = parsed.timestamp;
                timeDisplay = parsed.display;
            }

            // Fetch article page for content and image
            let content = '';
            let image = null;

            try {


                const articleRes = await rateLimitedFetch(link, { skipCache: true });

                if (articleRes.ok) {
                    const html = await articleRes.text();
                    const $article = cheerio.load(html);

                    // Content selector based on debug analysis
                    content = $article('.post_content').html() || '';
                    if (!content) {
                        content = $article('.article-body').html() || ''; // Fallback
                    }

                    // Clean content
                    if (content) {
                        const clean$ = cheerio.load(content);
                        clean$('script, style, iframe, .ad-container').remove();
                        content = clean$.text().trim().substring(0, 5000); // Limit length
                    }

                    // Image selector
                    image = $article('.single-image img').attr('src');
                    if (!image) {
                        image = $article('meta[property="og:image"]').attr('content');
                    }
                    if (!image) {
                        image = $article('meta[name="twitter:image"]').attr('content');
                    }
                }
            } catch (err) {
                console.error(`${source}: Error fetching article ${link}`, err);
            }

            // RSS Image fallback
            if (!image) {
                const mediaContent = $(el).find('media\\:content, content').attr('url');
                if (mediaContent) image = mediaContent;
            }



            stories.push({
                id: `${source.toLowerCase()}-${stories.length + Math.random()}`,
                source,
                title,
                link,
                image: image || null,
                time: timeDisplay,
                timestamp,
                section,
                content // Now populated
            });
        }

    } catch (e) {
        console.error(`${source} Error:`, e);
    }

    return stories;
}


async function scrapeGenericRSS(): Promise<Story[]> {
    const stories: Story[] = [];

    await Promise.all(GENERIC_FEEDS.map(async (feed) => {
        try {
            const res = await rateLimitedFetch(feed.url, { skipCache: true });
            if (!res.ok) return;

            const xml = await res.text();
            const $ = cheerio.load(xml, { xmlMode: true });

            let items = $('item');
            let isAtom = false;

            if (items.length === 0) {
                items = $('entry');
                isAtom = true;
            }

            items.slice(0, 5).each((_, el) => {
                const title = $(el).find('title').text().trim();

                let link = '';
                if (isAtom) {
                    link = $(el).find('link').attr('href') || $(el).find('link').text().trim();
                } else {
                    link = $(el).find('link').text().trim();
                    if (!link) link = $(el).find('guid').text().trim();
                }

                let pubDate = '';
                if (isAtom) {
                    pubDate = $(el).find('published').text() || $(el).find('updated').text();
                } else {
                    pubDate = $(el).find('pubDate').text().trim();
                }

                if (!link) return;

                let timestamp = Date.now();
                let timeDisplay = 'Recent';
                if (pubDate) {
                    const parsed = parsePublicationDate(pubDate);
                    timestamp = parsed.timestamp;
                    timeDisplay = parsed.display;
                }

                let image = $(el).find('media\\:content').attr('url')?.trim() ||
                    $(el).find('media\\:thumbnail').attr('url')?.trim() ||
                    $(el).find('enclosure').attr('url')?.trim();

                if (!image) {
                    // Try content for image
                    const content = $(el).find('content\\:encoded').text() || $(el).find('content').text() || $(el).find('description').text();
                    const match = content.match(/src="([^"]+)"/);
                    if (match) image = match[1]?.trim();
                }


                let category = '';
                if (isAtom) {
                    category = $(el).find('category').attr('term') ||
                        $(el).find('category').attr('label') || '';
                } else {
                    category = $(el).find('category').first().text().trim();
                }

                if (category.toLowerCase().includes('news')) category = 'News';
                else if (category.length > 20) category = category.substring(0, 20) + '...';

                stories.push({
                    id: `${feed.source.toLowerCase().replace(/\s+/g, '')}-${stories.length + Math.random()}`,
                    source: feed.source,
                    title,
                    link,
                    image: image || null,
                    time: timeDisplay,
                    timestamp,
                    section: category || feed.section
                });
            });

        } catch (e) {
            console.error(`Generic RSS ${feed.source} Error:`, e);
        }
    }));

    return stories;
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main() {
    console.log('SCRAPER: Starting job...');

    const [gwStories, adomStories, peaceStories, joyStories, gsnStories, genericStories] = await Promise.all([
        scrapeGhanaWeb(),
        scrapeAdomOnline(),
        scrapePeaceFM(),
        scrapeMyJoyOnline(),
        scrapeGhanaSoccerNet(),
        scrapeGenericRSS()
    ]);

    let allStories = [...gwStories, ...adomStories, ...peaceStories, ...joyStories, ...gsnStories, ...genericStories];

    console.log(`SCRAPER: Fetched ${allStories.length} raw stories.`);
    console.log(`SCRAPER: Fetched ${allStories.length} raw stories.`);

    // Deduplicate by link
    const uniqueMap = new Map();
    allStories.forEach(s => uniqueMap.set(s.link, s));
    allStories = Array.from(uniqueMap.values());

    // Fuzzy deduplication: Remove stories with similar titles (same story from different sources)
    const deduplicatedStories: Story[] = [];
    let duplicatesRemoved = 0;

    for (const story of allStories) {
        if (!isDuplicateStory(story, deduplicatedStories, 0.75)) {
            deduplicatedStories.push(story);
        } else {
            duplicatesRemoved++;
        }
    }

    allStories = deduplicatedStories;
    console.log(`SCRAPER: Removed ${duplicatesRemoved} duplicate stories based on title similarity`);

    // sort by timestamp desc
    allStories.sort((a, b) => b.timestamp - a.timestamp);

    // Get existing links from database to skip already-processed articles
    // Note: getAllLinks returns a Set<string>
    const existingLinks = await getAllLinks();
    console.log(`SCRAPER: Database has ${existingLinks.size} existing articles`);

    // Filter out articles we already have, UNLESS they have "Recent" time (bad parse) and we want to try fixing them.
    // We check if timestamp is within last 10 minutes of now AND display is 'Recent' (heuristic for bad parse or just fresh)
    // Actually, simpler: if existingLinks has it but we know MyJoyOnline lists are bad, we might want to force update.
    // For now, let's stick to "new stories" but allow a specialized "force update" batch if needed.

    // BETTER FIX: If we have an existing link but want to update it, we can't filter it out here.
    // But inserting it again with ON CONFLICT UPDATE works.
    // So let's include articles that match existingLinks IF their source is MyJoyOnline and we want to retry metadata.

    // Filter out articles we already have
    const newStories = allStories.filter(story => !existingLinks.has(story.link));
    console.log(`SCRAPER: Found ${newStories.length} new articles (skipped ${allStories.length - newStories.length} existing)`);
    console.log(`SCRAPER: Found ${newStories.length} new articles (skipped ${allStories.length - newStories.length} existing)`);

    // Deep Fetch Metadata for NEW articles
    console.log(`SCRAPER: Fetching metadata for ${newStories.length} new articles...`);

    // Process sequentially to be extremely gentle and avoid blocks
    for (const story of newStories) {
        if (story.source === 'GhanaSoccerNet') continue; // GSN already fetches full details
        try {
            const metadata = await fetchArticleMetadata(story.link, story.source);
            if (metadata.time) {
                story.time = metadata.time;
                story.timestamp = metadata.timestamp!;
                story.content = metadata.content;
                story.image = metadata.image || story.image;
            } else {
                if (story.source === 'GhanaWeb') console.error(`[FAILURE] No time returned for ${story.link}`);
            }
        } catch (e) {
            console.error(`SCRAPER: Error fetching metadata for ${story.link}:`, e);
        }
        console.log(`Processing ${story.source} - ${story.title.substring(0, 20)}...`);
    }

    allStories.sort((a, b) => b.timestamp - a.timestamp);

    allStories.forEach(story => {
        if (story.image) {
            story.image = story.image.trim();
        }
    });

    // Filter out articles older than 7 days (prevents old stories from appearing)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    // CRITICAL FIX: Only process newStories for insertion to avoid overwriting existing DB records with shallow data
    const recentStories = newStories.filter(story => story.timestamp >= sevenDaysAgo);

    // We expect correct timestamps now, so filter vigorously
    // If a story still has 'Recent' (from fallback because fetch failed), we technically keep it but it might have empty time string if source was GhanaWeb.
    // Let's filter out stories with empty time string?
    // No, better to show them than nothing, but user complained.
    // If we re-run successfuly, they will have time.

    const storiesWithImages = recentStories.filter(story =>
        story.image !== null &&
        story.image !== '' &&
        !story.image.toLowerCase().endsWith('.svg')
    );
    console.log(`SCRAPER: Filtered invalid/no-image -> ${storiesWithImages.length} articles to insert`);

    const newArticlesCount = await insertArticles(storiesWithImages as Article[]);
    console.log(`SCRAPER: Added ${newArticlesCount} new articles`);

    const deletedInvalid = await deleteInvalidArticles();
    const deletedOld = await deleteOldArticles(500);
    console.log(`SCRAPER: Cleanup -> Removed ${deletedInvalid} invalid and ${deletedOld} old articles.`);

    console.log('SCRAPER: Done.');
}

// Only run if called directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('SCRAPER: Fatal Error', error);
        process.exit(1);
    });
}
