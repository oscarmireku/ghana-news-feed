
import type { NextApiRequest, NextApiResponse } from 'next';
import * as cheerio from 'cheerio';
import { insertArticles, deleteOldArticles, deleteInvalidArticles, Article } from '../../lib/db';

export const config = {
    maxDuration: 60, // Serverless function timeout
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '');
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
            $('time').first().attr('datetime');

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
        let contentSelector = '';
        if (source === '3News') contentSelector = '.prose';
        else if (source === 'GhanaWeb') contentSelector = '#medsection1, .article-content-area';
        else if (source === 'AdomOnline') contentSelector = '.td-post-content';
        else if (source === 'MyJoyOnline') contentSelector = '#article-text';

        // Generic fallback selectors
        if (!contentSelector) {
            contentSelector = '.entry-content, .article-body, .post-content, .content-wrapper, article';
        }

        let contentEl = $(contentSelector).first();
        if (contentEl.length === 0 && source === 'GhanaWeb') {
            // Fallback for GhanaWeb
            contentEl = $('p').parent().filter((i, el) => $(el).find('p').length > 3).first();
        }

        let content = '';
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
            const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
async function scrapeMyJoyOnline(): Promise<Story[]> {
    const sections = [
        { name: 'News', url: 'https://www.myjoyonline.com/news/' },
        { name: 'Sports', url: 'https://www.myjoyonline.com/sports/' },
        { name: 'Business', url: 'https://www.myjoyonline.com/business/' }
    ];

    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    await Promise.all(sections.map(async (sec) => {
        try {
            const res = await fetch(sec.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = await res.text();
            const $ = cheerio.load(html);

            const containers = $('.news-main-list .col-lg-3, .col-lg-6, .home-section-story-list li, .main-listing-article');

            containers.slice(0, 10).each((_, el) => {
                const imgLink = $(el).find('a.bgposition');
                const titleLink = $(el).find('h3 a, h4 a, .title a').first();
                const fallbackLink = $(el).find('a').first();

                const finalLink = titleLink.length ? titleLink : (imgLink.length ? imgLink : fallbackLink);

                const link = finalLink.attr('href');
                let title = finalLink.text().trim();
                if (!title) title = $(el).find('h1, h2, h3, h4').text().trim();

                let image = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
                if (!image && imgLink.attr('style')) {
                    const match = imgLink.attr('style')?.match(/url\(['"]?([^'"]+)['"]?\)/);
                    if (match) image = match[1];
                }

                let dateStr = $(el).find('.date, time, .post-date, .published, .entry-date').first().text().trim();
                if (!dateStr) {
                    dateStr = $(el).find('time').attr('datetime') || '';
                }
                const { timestamp, display } = parsePublicationDate(dateStr);

                if (link && title && title.length > 10) {
                    const fullLink = resolveUrl('https://www.myjoyonline.com', link);
                    if (seenLinks.has(fullLink)) return;
                    seenLinks.add(fullLink);

                    stories.push({
                        id: `joy-${stories.length + Math.random()}`,
                        source: 'MyJoyOnline',
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
            console.error(`MyJoyOnline ${sec.name} Error:`, e);
        }
    }));

    return stories;
}

// ---------------------------------------------------------------------------
// Source: 3News (RSS Feed)
// ---------------------------------------------------------------------------
async function scrape3News(): Promise<Story[]> {
    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    try {
        const res = await fetch('https://3news.com/news/feed.xml', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) throw new Error(`3News RSS failed: ${res.status}`);

        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        $('item').slice(0, 10).each((_, el) => {
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

            if (!image) {
                const description = $(el).find('description').text();
                const match = description.match(/src="([^"]+)"/);
                if (match) image = match[1];
            }

            stories.push({
                id: `3news-${stories.length + Math.random()}`,
                source: '3News',
                title,
                link,
                image: image || null,
                time: timeDisplay,
                timestamp,
                section: 'News'
            });
        });
    } catch (e) {
        console.error('3News Error:', e);
    }

    return stories;
}

async function scrapeDailyGuide(): Promise<{ stories: Article[], logs: string[] }> {
    const stories: Article[] = [];
    const logs: string[] = [];
    try {
        const res = await fetch('https://dailyguidenetwork.com/feed/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            next: { revalidate: 300 }
        });

        if (!res.ok) {
            logs.push(`DailyGuide RSS Error: ${res.status}`);
            return { stories, logs };
        }

        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        const items = $('item').slice(0, 10);
        logs.push(`DailyGuide: Found ${items.length} items`);

        items.each((_, el) => {
            const title = $(el).find('title').text().trim();
            const link = $(el).find('link').text().trim();
            const pubDate = $(el).find('pubDate').text().trim();

            if (!link) return;

            let timestamp = Date.now();
            let timeDisplay = 'Recent';
            if (pubDate) {
                const parsed = parsePublicationDate(pubDate);
                timestamp = parsed.timestamp;
                timeDisplay = parsed.display;
            }

            stories.push({
                id: `dailyguide-${stories.length + Math.random()}`,
                source: 'DailyGuide',
                title,
                link,
                image: null,
                time: timeDisplay,
                timestamp,
                section: 'News'
            });
        });
    } catch (e) {
        logs.push(`DailyGuide Error: ${e}`);
    }

    return { stories, logs };
}

// ---------------------------------------------------------------------------
// Source: Generic RSS Scraper
// ---------------------------------------------------------------------------
const GENERIC_FEEDS = [
    { source: 'CitiNewsRoom', url: 'https://citinewsroom.com/feed/', section: 'News' },
    { source: 'Modern Ghana', url: 'https://www.modernghana.com/rssfeed/news.xml', section: 'News' },
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
            const res = await fetch(feed.url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                next: { revalidate: 300 }
            });
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Secure the endpoint with a secret key
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    console.log('CRON: Starting scrape...');

    const [ghanaStories, adomStories, peaceStories, joyStories, threeNewsStories, dailyGuideResult, genericStories] = await Promise.all([
        scrapeGhanaWeb(),
        scrapeAdomOnline(),
        scrapePeaceFM(),
        scrapeMyJoyOnline(),
        scrape3News(),
        scrapeDailyGuide(),
        scrapeGenericRSS()
    ]);

    const dailyGuideStories = dailyGuideResult.stories;

    let allStories = [...ghanaStories, ...adomStories, ...peaceStories, ...joyStories, ...threeNewsStories, ...dailyGuideStories, ...genericStories];

    // Deduplicate by link
    const uniqueMap = new Map();
    allStories.forEach(s => uniqueMap.set(s.link, s));
    allStories = Array.from(uniqueMap.values());

    // sort
    allStories.sort((a, b) => b.timestamp - a.timestamp);

    // Deep Fetch Metadata for ALL articles to ensure correct images and dates
    const batch = allStories.slice(0, 80); // Limit to 80 articles per scrape

    console.log(`CRON: Fetching metadata for ${batch.length} articles...`);

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

    const storiesWithImages = allStories.filter(story =>
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
