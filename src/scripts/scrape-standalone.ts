import 'dotenv/config';

// FAIL FAST: Ensure we are connecting to the real DB in production/CI
if (!process.env.TURSO_DATABASE_URL && process.env.CI) {
    console.error("CRITICAL ERROR: TURSO_DATABASE_URL is not set in CI environment!");
    console.error("The scraper would otherwise write to a temporary local file and data would be lost.");
    process.exit(1);
}

import * as cheerio from 'cheerio';
import { insertArticles, deleteOldArticles, deleteInvalidArticles, getAllLinks, getLatestTimestampsBySource, Article } from '../lib/db';
import { rateLimitedFetch } from '../lib/rate-limited-fetch';
import { fetchRSS, NewsItem } from '../lib/rss';

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
        if (similarity >= threshold) {
            if (['MyJoyOnline', 'Nkonkonsa', 'AdomOnline'].includes(newStory.source)) {
                console.log(`[DUPLICATE] Dropping ${newStory.source} "${newStory.title}" -> Match: "${existing.title}" (${(similarity * 100).toFixed(1)}%)`);
            }
            return true;
        }
        return false;
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

    // console.log(`[DEBUG DATE] Input: ${dateStr}, Adjusted: ${cleaned}, Parsed: ${d.toString()}`);

    if (!isNaN(d.getTime())) {
        const timestamp = d.getTime();
        const display = new Date(timestamp).toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            month: 'short',
            day: 'numeric'
        });
        return { timestamp, display };
    }

    // If we can't parse it, return 0 so it gets filtered out instead of floating to top
    // Try without GMT if GMT append failed
    const d2 = new Date(dateStr.trim());
    if (!isNaN(d2.getTime())) {
        const timestamp = d2.getTime();
        const display = new Date(timestamp).toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            month: 'short',
            day: 'numeric'
        });
        return { timestamp, display };
    }

    return { timestamp: 0, display: 'Recent' };
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
export async function fetchArticleMetadata(link: string, source: string): Promise<Partial<Story>> {
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
            const gwDate = $('meta[property="article:published_time"]').attr('content') ||
                $('meta[property="og:article:published_time"]').attr('content') ||
                $('meta[itemprop="datePublished"]').attr('content');

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

        // Content Extraction
        let content: string | undefined;

        const robustSelectors = [
            '#article-body', '.article-body', '.story-content', '.content-body',
            '.post-content', '.entry-content', 'article', '#main-content',
            '.news-content', '.item-content', '[itemprop="articleBody"]',
            '.td-post-content', '#article-text', '.prose'
        ];

        // Add source specific selectors to the front if not 3News (handled above)
        if (source === 'GhanaWeb') robustSelectors.unshift('#medsection1', '.article-content-area');
        if (source === '3News') robustSelectors.unshift('.prose');

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
                id: `peace-${Math.random().toString(36).substring(2, 9)}`, // Use random ID to prevent collisions on link updates
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
                        id: `peace-${Math.random().toString(36).substring(2, 9)}`,
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





// ---------------------------------------------------------------------------
// Source: Generic RSS Scraper
// ---------------------------------------------------------------------------
const GENERIC_FEEDS = [
    { source: '3News', url: 'https://3news.com/feed/', section: 'News' },
    { source: 'Tech Labari', url: 'https://techlabari.com/feed/', section: 'Tech' },
    { source: 'News Ghana', url: 'https://newsghana.com.gh/feed/', section: 'News' },

    { source: 'DailyGuide', url: 'https://dailyguidenetwork.com/feed/', section: 'News' },
    // CitiNewsRoom moved to dedicated scraper
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


// ---------------------------------------------------------------------------
// Source: CitiNewsRoom (HTML Scrape Sections)
// ---------------------------------------------------------------------------
async function scrapeCitiNewsRoom(): Promise<Story[]> {
    const sections = [
        { name: 'News', url: 'https://citinewsroom.com/news/' },
        { name: 'Business', url: 'https://citinewsroom.com/category/business/' },
        { name: 'Politics', url: 'https://citinewsroom.com/category/politics/' },
        { name: 'Entertainment', url: 'https://citinewsroom.com/category/entertainment/' },
        { name: 'Regional', url: 'https://citinewsroom.com/category/regional-news/' },
        { name: 'Sports', url: 'https://citisportsonline.com/' }
    ];

    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    await Promise.all(sections.map(async (sec) => {
        try {
            const res = await rateLimitedFetch(sec.url, { skipCache: true });
            if (!res.ok) {
                console.error(`CitiNewsRoom ${sec.name}: Failed to fetch. Status: ${res.status}`);
                return;
            }
            const html = await res.text();
            const $ = cheerio.load(html);

            const articles = $('.jeg_post');

            articles.slice(0, 15).each((_, el) => {
                const titleEl = $(el).find('.jeg_post_title a').first();
                const link = titleEl.attr('href');
                let title = titleEl.text().trim();

                let image = $(el).find('.jeg_thumb img').attr('data-src') ||
                    $(el).find('.jeg_thumb img').attr('src');

                // Handle lazy loading image variants
                if (!image) {
                    const srcset = $(el).find('.jeg_thumb img').attr('data-srcset');
                    if (srcset) {
                        const parts = srcset.split(',');
                        if (parts.length > 0) {
                            image = parts[parts.length - 1].trim().split(' ')[0];
                        }
                    }
                }

                let dateStr = $(el).find('.jeg_meta_date').text().trim();
                const { timestamp, display } = parsePublicationDate(dateStr);

                if (link && title && title.length > 5 && !seenLinks.has(link)) {
                    seenLinks.add(link);

                    // Specific section from article if available, otherwise generic section
                    let category = $(el).find('.jeg_post_category span a').text().trim();
                    if (!category) category = sec.name;

                    stories.push({
                        id: `citi-${stories.length + Math.random()}`,
                        source: 'CitiNewsRoom',
                        title,
                        link: link,
                        image: image || null,
                        time: display,
                        timestamp,
                        section: category
                    });
                }
            });
        } catch (e) {
            console.error(`CitiNewsRoom ${sec.name} Error:`, e);
        }
    }));

    return stories;
}



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



// Helper to map NewsItem to Story
function mapNewsItemsToStories(items: NewsItem[], defaultSection: string): Story[] {
    return items.map((item, index) => {
        let timestamp = Date.now();
        let timeDisplay = 'Recent';
        if (item.pubDate) {
            const parsed = parsePublicationDate(item.pubDate);
            timestamp = parsed.timestamp;
            timeDisplay = parsed.display;
        }

        return {
            id: `${item.source.toLowerCase().replace(/\s+/g, '')}-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
            source: item.source,
            title: item.title,
            link: item.link,
            image: item.imageUrl || null,
            time: timeDisplay,
            timestamp,
            section: item.category || defaultSection,
            content: item.content
        };
    });
}

async function scrapeMyJoyOnline(): Promise<Story[]> {
    console.log('SCRAPER: Scraping MyJoyOnline (RSS)...');
    const items = await fetchRSS('https://www.myjoyonline.com/feed/', 'MyJoyOnline', 'News');
    return mapNewsItemsToStories(items, 'News');
}

async function scrapeGenericRSS(): Promise<Story[]> {
    console.log('SCRAPER: Scraping Generic RSS Feeds...');
    const allStories: Story[] = [];

    await Promise.all(GENERIC_FEEDS.map(async (feed) => {
        const items = await fetchRSS(feed.url, feed.source, feed.section);
        const stories = mapNewsItemsToStories(items, feed.section);
        allStories.push(...stories);
    }));

    return allStories;
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main() {
    console.log('SCRAPER: Starting job...');

    const [gwStories, adomStories, peaceStories, joyStories, citiStories, gsnStories, genericStories] = await Promise.all([
        scrapeGhanaWeb(),
        scrapeAdomOnline(),
        scrapePeaceFM(),
        scrapeMyJoyOnline(),
        scrapeCitiNewsRoom(),
        scrapeGhanaSoccerNet(),
        scrapeGenericRSS()
    ]);

    let allStories = [...gwStories, ...adomStories, ...peaceStories, ...joyStories, ...citiStories, ...gsnStories, ...genericStories];

    console.log(`SCRAPER: Fetched ${allStories.length} raw stories.`);
    console.log(`SCRAPER: Fetched ${allStories.length} raw stories.`);

    // Deduplicate by link
    const uniqueMap = new Map();
    allStories.forEach(s => uniqueMap.set(s.link, s));
    allStories = Array.from(uniqueMap.values());

    // Fuzzy deduplication: Remove stories with similar titles (same story from different sources)
    // DISABLED: User reports missing feeds. We want to keep all sources populated even if titles match.
    // Ideally we would group them in the UI, but for now, we prioritize availability.
    const deduplicatedStories: Story[] = [];
    let duplicatesRemoved = 0;

    for (const story of allStories) {
        // if (!isDuplicateStory(story, deduplicatedStories, 0.75)) {
        deduplicatedStories.push(story);
        // } else {
        //     duplicatesRemoved++;
        // }
    }

    allStories = deduplicatedStories;
    console.log(`SCRAPER: Removed ${duplicatesRemoved} duplicate stories based on title similarity`);

    // sort by timestamp desc
    allStories.sort((a, b) => b.timestamp - a.timestamp);

    // Get existing links from database to skip already-processed articles
    // Note: getAllLinks returns a Set<string>
    const existingLinks = await getAllLinks();
    const sourceTimestamps = await getLatestTimestampsBySource();

    console.log(`SCRAPER: Database has ${existingLinks.size} existing articles`);
    console.log('SCRAPER: Latest timestamps per source:', Object.fromEntries(sourceTimestamps));

    // Filter out articles we already have, UNLESS they have "Recent" time (bad parse) and we want to try fixing them.
    // We check if timestamp is within last 10 minutes of now AND display is 'Recent' (heuristic for bad parse or just fresh)
    // Actually, simpler: if existingLinks has it but we know MyJoyOnline lists are bad, we might want to force update.
    // For now, let's stick to "new stories" but allow a specialized "force update" batch if needed.

    // BETTER FIX: If we have an existing link but want to update it, we can't filter it out here.
    // But inserting it again with ON CONFLICT UPDATE works.
    // So let's include articles that match existingLinks IF their source is MyJoyOnline and we want to retry metadata.

    // Filter out articles we already have
    const newStories = allStories.filter(story => {
        const exists = existingLinks.has(story.link);
        if (exists && ['MyJoyOnline', 'Nkonkonsa'].includes(story.source)) {
            // console.log(`[EXISTING] Skipping ${story.source}: ${story.title}`);
        }

        if (exists) return false;

        // Incremental Scraping Check:
        // Use the per-source latest timestamp to filter out old news.
        // Safety margin: 1 hour (3600000ms) to allow for minor clock diffs or updates.
        // If story.timestamp is 0 or Date.now() (fallback), we let it through to be deeper checked.
        // Only filter if we have a valid timestamp on the story AND in the DB.
        const lastSeen = sourceTimestamps.get(story.source) || 0;
        if (lastSeen > 0 && story.timestamp > 0 && story.timestamp < (lastSeen - 3600000)) {
            // console.log(`[OLD] Dropping ${story.source} - ${story.title} (Time: ${new Date(story.timestamp).toISOString()} vs Last: ${new Date(lastSeen).toISOString()})`);
            return false;
        }

        return true;
    });
    console.log(`SCRAPER: Found ${newStories.length} new articles (skipped ${allStories.length - newStories.length} existing)`);
    console.log(`SCRAPER: Found ${newStories.length} new articles (skipped ${allStories.length - newStories.length} existing)`);

    // Deep Fetch Metadata for NEW articles
    // INCREASED LIMIT to 30 (reduced from 100) to prevent GHA timeouts (~15 mins limit)
    const batch = newStories.slice(0, 30);
    console.log(`SCRAPER: Fetching metadata for ${batch.length} new articles (limited from ${newStories.length})...`);

    // Process sequentially to be extremely gentle and avoid blocks
    for (const story of batch) {
        // Skip deep fetch if we already have content (e.g. from full RSS feeds)
        if (story.content && story.content.length > 200 && story.image) {
            console.log(`[SKIP] Skipping deep fetch for ${story.source} - Content & Image present.`);
            continue;
        }

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
    // CRITICAL FIX: Only process the processed BATCH for insertion to avoid overwriting existing DB records with shallow data
    const recentStories = batch.filter(story => story.timestamp >= sevenDaysAgo);

    // We expect correct timestamps now, so filter vigorously
    // If a story still has 'Recent' (from fallback because fetch failed), we technically keep it but it might have empty time string if source was GhanaWeb.

    const storiesWithImages = recentStories.filter(story =>
        story.image !== null &&
        story.image !== '' &&
        !story.image.toLowerCase().endsWith('.svg')
    );
    console.log(`SCRAPER: Image Filter Stats: Input=${recentStories.length}, Output=${storiesWithImages.length}, Dropped=${recentStories.length - storiesWithImages.length}`);

    if (recentStories.length > storiesWithImages.length) {
        const dropped = recentStories.filter(s => !storiesWithImages.includes(s));
        console.log(`SCRAPER: Dropped ${dropped.length} articles due to missing/invalid images. Examples:`);
        dropped.forEach(s => console.log(` - [${s.source}] ${s.title} (Img: ${s.image})`));
    }

    console.log(`SCRAPER: Filtered invalid/no-image -> ${storiesWithImages.length} articles to insert`);

    const newArticlesCount = await insertArticles(storiesWithImages as Article[]);
    console.log(`SCRAPER: Added ${newArticlesCount} new articles`);

    const deletedInvalid = await deleteInvalidArticles();
    const deletedOld = await deleteOldArticles(1000);
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
