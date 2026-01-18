
import type { NextApiRequest, NextApiResponse } from 'next';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { insertArticles, deleteOldArticles, deleteInvalidArticles, getAllLinks, Article } from '../../lib/db';
import { fetchRSS } from '../../lib/rss';

export const config = {
    maxDuration: 60, // Serverless function timeout
};

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

    const cleaned = dateStr.trim();
    const d = new Date(cleaned);

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


// Fallback: Fetch article page to find og:image and parsing date
async function fetchArticleMetadata(link: string, source?: string): Promise<{ image: string | null, timestamp?: number, time?: string, content?: string }> {
    try {
        // Special handling for PeaceFM API
        if (source === 'PeaceFM' || link.includes('peacefmonline.com')) {
            // Extract ID. format: /.../.../123456-some-slug
            const idMatch = link.match(/\/(\d+)-/);
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

        const res = await fetch(link, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
        if (!res.ok) return { image: null };
        const html = await res.text();
        const $ = cheerio.load(html);

        // Image
        let image = $('meta[property="og:image"]').attr('content') ||
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
            $('time').first().attr('datetime');

        // MyJoyOnline-specific date extraction
        if (!dateStr && source === 'MyJoyOnline') {
            dateStr = $('.post-date, .entry-date, .published, .article-date').first().text().trim() ||
                $('.meta-info time').text().trim() ||
                $('span[class*="date"]').first().text().trim();
        }

        // GhanaWeb: Prioritize article:published_time as requested by user
        if (source === 'GhanaWeb') {
            const gwDate = $('meta[property="article:published_time"]').attr('content') ||
                $('meta[property="og:article:published_time"]').attr('content') ||
                $('meta[itemprop="datePublished"]').attr('content');
            if (gwDate) dateStr = gwDate;
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
        let content = '';

        if (source === '3News') {
            const el = $('.article-content').first();
            if (el.length > 0) {
                // deeply remove specific unwanted 3news elements
                el.find('.gam-ad-slot, .ad-viewability-tracker, ins.adsbygoogle, script, iframe, style').remove();

                // Remove privacy managers, "remove ads" buttons/text
                el.find('div, button, a').each((_, elem) => {
                    const t = $(elem).text().toLowerCase();
                    if (t.includes('remove ads') || t.includes('privacy manager') || t.includes('tap here to add 3news')) {
                        $(elem).remove();
                    }
                });

                // Get paragraphs
                const paragraphs: string[] = [];
                el.find('p').each((_, p) => {
                    const t = $(p).text().trim();
                    if (t.length > 5 && !t.toLowerCase().includes('read also') && !t.toLowerCase().includes('read more')) {
                        paragraphs.push(`<p>${t}</p>`);
                    }
                });

                content = paragraphs.join('');
            }
        }

        if (!content) {
            let contentSelector = '';
            // if (source === '3News') contentSelector = '.prose'; // Handled above now
            if (source === 'GhanaWeb') contentSelector = '#medsection1, .article-content-area';
            else if (source === 'AdomOnline') contentSelector = '.td-post-content';
            else if (source === 'MyJoyOnline') contentSelector = '#article-text';
            else if (source === 'Yen' || source === 'yen.com.gh') contentSelector = '.js-article-body, .post-content';
            else if (source === 'Pulse' || source === 'pulse.com.gh') contentSelector = 'article, .max-w-\\[620px\\], .article-content';

            // Generic fallback selectors
            if (!contentSelector) {
                contentSelector = '.entry-content, .article-body, .post-content, .content-wrapper, article';
            }

            let contentEl = $(contentSelector).first();
            if (contentEl.length === 0 && source === 'GhanaWeb') {
                // Fallback for GhanaWeb
                contentEl = $('p').parent().filter((i, el) => $(el).find('p').length > 3).first();
            }

            if (contentEl.length) {
                // Remove unwanted elements
                contentEl.find('script, style, iframe, .related-posts, .ads, .ad, [class*="ad-"], [id*="ad-"]').remove();

                // Get paragraphs
                const paragraphs: string[] = [];
                contentEl.find('p').each((_, el) => {
                    const text = $(el).text().trim();
                    if (text.length > 20) { // Filter out short snippets/captions
                        paragraphs.push(`<p>${text}</p>`);
                    }
                });
                content = paragraphs.join('');
            }
        }

        // ---------------------------------------------------------
        // Fallback: Mozilla Readability
        // ---------------------------------------------------------
        if (!content || content.length < 100) {
            const dom = new JSDOM(html, { url: link });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            if (article && article.content) {
                // Readability returns HTML, but we might want to ensure it's clean
                content = article.content;
            }
        }

        return { image, timestamp, time, content };
    } catch {
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
        { name: 'Business', url: 'https://www.ghanaweb.com/GhanaHomePage/business/' }
    ];

    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    await Promise.all(sections.map(async (sec) => {
        try {
            const res = await fetch(sec.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = await res.text();
            const $ = cheerio.load(html);

            let candidates = $('.inner-lead, .sub-menu-list__news li, .news_listing .inner, #leads .inner, .news-list li');

            if (candidates.length === 0) {
                candidates = $('a[href*="artikel.php"], a[href*="/NewsArchive/"], a[href*="/SportsArchive/"], a[href*="/business/"]');
            }

            candidates.slice(0, 10).each((_, el) => {
                const a = $(el).is('a') ? $(el) : $(el).find('a').first();
                const link = a.attr('href');
                let title = a.attr('title') || a.text().trim();

                if (!title || title.length < 5) {
                    title = $(el).find('h2, h3, h4, p').text().trim();
                }

                let image = $(el).find('img').attr('src');
                if (!image) {
                    image = $(el).closest('div, li').find('img').attr('src');
                }

                let dateStr = $(el).find('.date, .time, time, .published, .post-date').first().text().trim();
                if (!dateStr) {
                    dateStr = $(el).find('time').attr('datetime') || '';
                }
                const { timestamp, display } = parsePublicationDate(dateStr);

                const unwantedTitlePatterns = [
                    'Home - News', 'Home - Business', 'Home - Sports', 'Home-Business',
                    'Business archive', 'News Archive', 'Sports Archive', 'Photo Archives',
                    'Archive', 'Category:', 'Section:', 'More News', 'More Stories',
                    'View All', 'Latest News', 'Top Stories'
                ];

                const isUnwantedTitle = unwantedTitlePatterns.some(pattern =>
                    title.toLowerCase().trim() === pattern.toLowerCase() ||
                    title.toLowerCase().includes(pattern.toLowerCase())
                );

                const hasArticleId = link?.includes('artikel.php?ID=') ||
                    /\/\d{7,}-/.test(link || '');

                const hasSvgImage = image?.toLowerCase().endsWith('.svg');

                if (link && title && title.length > 10 && !link.includes('javascript') && !link.includes('#') && !isUnwantedTitle && hasArticleId && !hasSvgImage) {
                    const fullLink = resolveUrl('https://www.ghanaweb.com', link);
                    if (seenLinks.has(fullLink)) return;
                    seenLinks.add(fullLink);

                    if (image) image = resolveUrl('https://cdn.ghanaweb.com', image);

                    stories.push({
                        id: `gw-${stories.length + Math.random()}`,
                        source: 'GhanaWeb',
                        title,
                        link: fullLink,
                        image: image || null,
                        time: display,
                        timestamp,
                        section: sec.name
                    });
                }
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
// ---------------------------------------------------------------------------
// Source: AdomOnline (RSS Sections)
// ---------------------------------------------------------------------------
async function scrapeAdomOnline(): Promise<Story[]> {
    try {
        const items = await fetchRSS('https://www.adomonline.com/feed/', 'AdomOnline', 'News');
        return items.map(item => ({
            id: `adom-${Math.random().toString(36).substr(2, 9)}`,
            source: 'AdomOnline',
            title: item.title,
            link: item.link,
            image: item.imageUrl || null,
            time: timeAgo(new Date(item.pubDate).getTime()),
            timestamp: new Date(item.pubDate).getTime(),
            section: 'News',
            content: item.content
        }));
    } catch (e) {
        console.error('AdomOnline Error:', e);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Source: PeaceFM (API)
// ---------------------------------------------------------------------------
async function scrapePeaceFM(): Promise<Story[]> {
    try {
        const response = await fetch('https://articles-engine.peacefmonline.com/v1/articles?limit=30', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!response.ok) return [];

        const json = await response.json();
        if (json.status !== 'success' || !json.data) return [];

        const articles = json.data.map((item: any) => {
            const section = item.section?.section_location || 'local';
            const category = item.category?.category_location || 'news';
            const link = `https://www.peacefmonline.com/pages/${section}/${category}/${item.slug}`;

            return {
                id: `peace-${item.article_id}`,
                source: 'PeaceFM',
                title: item.main_title,
                link: link,
                image: item.main_photo?.photo_url || null,
                time: timeAgo(new Date(item.created_at).getTime()),
                section: item.section?.section_name || 'News',
                timestamp: new Date(item.created_at).getTime()
            };
        });

        return articles.filter((a: any) => a.title && a.link);
    } catch (error) {
        console.error('Error scraping PeaceFM:', error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Source: MyJoyOnline (HTML Scrape Sections)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Source: MyJoyOnline (RSS)
// ---------------------------------------------------------------------------
async function scrapeMyJoyOnline(): Promise<Story[]> {
    try {
        const items = await fetchRSS('https://www.myjoyonline.com/feed/', 'MyJoyOnline', 'News');
        return items.map(item => ({
            id: `joy-${Math.random().toString(36).substr(2, 9)}`,
            source: 'MyJoyOnline',
            title: item.title,
            link: item.link,
            image: item.imageUrl || null,
            time: timeAgo(new Date(item.pubDate).getTime()),
            timestamp: new Date(item.pubDate).getTime(),
            section: 'News',
            content: item.content
        }));
    } catch (e) {
        console.error('MyJoyOnline Error:', e);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Source: 3News (RSS Feed)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Source: 3News (RSS Feed)
// ---------------------------------------------------------------------------
async function scrape3News(): Promise<Story[]> {
    try {
        const items = await fetchRSS('https://3news.com/feed/', '3News', 'News');
        return items.map(item => ({
            id: `3news-${Math.random().toString(36).substr(2, 9)}`,
            source: '3News',
            title: item.title,
            link: item.link,
            image: item.imageUrl || null,
            time: timeAgo(new Date(item.pubDate).getTime()),
            timestamp: new Date(item.pubDate).getTime(),
            section: 'News',
            content: item.content
        }));
    } catch (e) {
        console.error('3News Error:', e);
        return [];
    }
}

async function scrapeDailyGuide(): Promise<{ stories: Article[], logs: string[] }> {
    const stories: Article[] = [];
    const logs: string[] = [];
    try {
        const items = await fetchRSS('https://dailyguidenetwork.com/feed/', 'DailyGuide', 'News');
        items.forEach(item => {
            stories.push({
                id: `dailyguide-${Math.random().toString(36).substr(2, 9)}`,
                source: 'DailyGuide',
                title: item.title,
                link: item.link,
                image: item.imageUrl || null,
                time: timeAgo(new Date(item.pubDate).getTime()),
                timestamp: new Date(item.pubDate).getTime(),
                section: 'News',
                content: item.content
            } as Article);
        });
        logs.push(`DailyGuide: Found ${items.length} items`);
    } catch (e) {
        logs.push(`DailyGuide Error: ${e}`);
    }

    return { stories, logs };
}

// ---------------------------------------------------------------------------
// Source: CitiNewsRoom (HTML Scrape Sections)
// ---------------------------------------------------------------------------
async function scrapeCitiNewsRoom(): Promise<Story[]> {
    const sections = [
        { name: 'News', url: 'https://citinewsroom.com/news/' },
        { name: 'Business', url: 'https://citinewsroom.com/category/business/' },
        { name: 'Politics', url: 'https://citinewsroom.com/category/politics/' },
        { name: 'Regional', url: 'https://citinewsroom.com/category/regional-news/' },
        { name: 'Sports', url: 'https://citisportsonline.com/' }
    ];

    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    await Promise.all(sections.map(async (sec) => {
        try {
            const res = await fetch(sec.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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

                    // Explicitly skip Entertainment articles even if found in other sections
                    if (category.toLowerCase().includes('entertainment') || link.toLowerCase().includes('/entertainment/')) {
                        return;
                    }

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

// ---------------------------------------------------------------------------
// Source: Generic RSS Scraper
// ---------------------------------------------------------------------------
const GENERIC_FEEDS = [
    { source: 'yen.com.gh', url: 'https://yen.com.gh/rss/all.rss', section: 'News' },
    { source: 'pulse.com.gh', url: 'https://www.pulse.com.gh/rss-articles.xml', section: 'News' },
    { source: 'GNA', url: 'https://gna.org.gh/feed/', section: 'News' },
    { source: 'Graphic Online', url: 'https://www.graphic.com.gh/news/general-news?format=feed', section: 'News' },
    { source: 'Ghanaian Times', url: 'https://www.ghanaiantimes.com.gh/feed/', section: 'News' },
    { source: 'Starr FM', url: 'https://starrfm.com.gh/feed/', section: 'News' },
    { source: 'News Ghana', url: 'https://newsghana.com.gh/feed/', section: 'News' },
    { source: 'The B&FT', url: 'https://thebftonline.com/feed/', section: 'Business' },
    { source: 'Atinka Online', url: 'https://atinkaonline.com/feed/', section: 'News' },
    { source: 'Asaase Radio', url: 'https://asaaseradio.com/feed/', section: 'News' },
    { source: 'The Herald', url: 'https://theheraldghana.com/feed/', section: 'News' },
    { source: 'The Chronicle', url: 'https://thechronicle.com.gh/feed/', section: 'News' },
    { source: 'GhPage', url: 'https://ghpage.com/feed/', section: 'Entertainment' },
    { source: 'Ameyaw Debrah', url: 'https://ameyawdebrah.com/feed/', section: 'Entertainment' },
    { source: 'YFM Ghana', url: 'https://yfmghana.com/feed/', section: 'Entertainment' },
    { source: 'Happy Ghana', url: 'https://www.happyghana.com/feed/', section: 'News' },
    { source: 'GhanaSoccerNet', url: 'https://ghanasoccernet.com/feed', section: 'Sports' }
];

async function scrapeGenericRSS(): Promise<Story[]> {
    const stories: Story[] = [];

    await Promise.all(GENERIC_FEEDS.map(async (feed) => {
        try {
            const items = await fetchRSS(feed.url, feed.source, feed.section);
            items.forEach(item => {
                stories.push({
                    id: `${feed.source.toLowerCase().replace(/\s+/g, '')}-${Math.random().toString(36).substr(2, 9)}`,
                    source: feed.source,
                    title: item.title,
                    link: item.link,
                    image: item.imageUrl || null,
                    time: timeAgo(new Date(item.pubDate).getTime()),
                    timestamp: new Date(item.pubDate).getTime(),
                    section: feed.section,
                    content: item.content
                });
            });
        } catch (e) {
            console.error(`Generic RSS Error (${feed.source}):`, e);
        }
    }));

    return stories;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Secure the endpoint with a secret key
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    console.log('CRON: Starting scrape...');

    const [ghanaStories, adomStories, peaceStories, joyStories, threeNewsStories, dailyGuideResult, citiStories, genericStories] = await Promise.all([
        scrapeGhanaWeb(),
        scrapeAdomOnline(),
        scrapePeaceFM(),
        scrapeMyJoyOnline(),
        scrape3News(),
        scrapeDailyGuide(),
        scrapeCitiNewsRoom(),
        scrapeGenericRSS()
    ]);

    const dailyGuideStories = dailyGuideResult.stories;

    let allStories = [...ghanaStories, ...adomStories, ...peaceStories, ...joyStories, ...threeNewsStories, ...dailyGuideStories, ...citiStories, ...genericStories];

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
    console.log(`CRON: Removed ${duplicatesRemoved} duplicate stories based on title similarity`);

    // sort
    allStories.sort((a, b) => b.timestamp - a.timestamp);

    // Get existing links from database to skip already-processed articles
    const existingLinks = await getAllLinks();
    console.log(`CRON: Database has ${existingLinks.size} existing articles`);

    // Filter out articles we already have
    const newStories = allStories.filter(story => !existingLinks.has(story.link));
    console.log(`CRON: Found ${newStories.length} new articles (skipped ${allStories.length - newStories.length} existing)`);

    // Deep Fetch Metadata ONLY for NEW articles to ensure correct images and dates
    const batch = newStories.slice(0, 20); // Limit to 20 articles per scrape to prevent Vercel 60s timeout

    console.log(`CRON: Fetching metadata for ${batch.length} new articles...`);

    await Promise.all(batch.map(async (story) => {
        const metadata = await fetchArticleMetadata(story.link, story.source);

        if (metadata.timestamp && metadata.time) {
            story.timestamp = metadata.timestamp;
            story.time = metadata.time;
        }
        if (metadata.image) {
            story.image = metadata.image;
        }
        if (metadata.content) {
            story.content = metadata.content;
        }
    }));


    allStories.sort((a, b) => b.timestamp - a.timestamp);

    allStories.forEach(story => {
        if (story.image) {
            story.image = story.image.trim();
        }
    });

    // Filter out articles older than 7 days (prevents old stories from appearing)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentStories = allStories.filter(story => story.timestamp >= sevenDaysAgo);
    const oldStoriesFiltered = allStories.length - recentStories.length;
    if (oldStoriesFiltered > 0) {
        console.log(`CRON: Filtered out ${oldStoriesFiltered} articles older than 7 days`);
    }

    const storiesWithImages = recentStories.filter(story =>
        story.image !== null &&
        story.image !== '' &&
        !story.image.toLowerCase().endsWith('.svg')
    );
    console.log(`CRON: Filtered -> ${storiesWithImages.length} articles to insert`);

    const newArticlesCount = await insertArticles(storiesWithImages as Article[]);
    console.log(`CRON: Added ${newArticlesCount} new articles`);

    const deletedInvalid = await deleteInvalidArticles();
    const deletedOld = await deleteOldArticles(500);
    console.log(`CRON: Cleanup -> Removed ${deletedInvalid} invalid and ${deletedOld} old articles.`);

    res.status(200).json({
        success: true,
        added: newArticlesCount,
        cleaned_invalid: deletedInvalid,
        cleaned_old: deletedOld
    });
}
