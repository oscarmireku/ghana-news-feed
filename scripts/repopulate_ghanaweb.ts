
import 'dotenv/config';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { insertArticles } from '../src/lib/db';

// Helpers
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
    return { timestamp: Date.now(), display: 'Recent' };
}

function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
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

// Scrape Logic
async function fetchArticleMetadata(link: string, source?: string): Promise<{ image: string | null, timestamp?: number, time?: string, content?: string }> {
    try {
        console.log(`Fetching metadata for: ${link}`);
        const res = await fetch(link, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
        if (!res.ok) return { image: null };
        const html = await res.text();
        const $ = cheerio.load(html);

        let image = $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content') || null;

        let dateStr = $('meta[property="og:article:published_time"]').attr('content') ||
            $('meta[property="article:published_time"]').attr('content') ||
            $('meta[name="article:published_time"]').attr('content') ||
            $('meta[property="og:updated_time"]').attr('content') ||
            $('meta[property="article:modified_time"]').attr('content') ||
            $('meta[itemprop="datePublished"]').attr('content') ||
            $('meta[name="pubdate"]').attr('content') ||
            $('#date').text() ||
            $('time').first().attr('datetime');

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

        let content = '';
        let contentSelector = '';
        // THIS IS THE FIX:
        if (source === 'GhanaWeb') contentSelector = '#medsection1, #medsectionWideRight, .article-left-col, .article-content-area';

        let contentEl = $(contentSelector).first(); // Note: .first() might take the wrong one if multiple exist, but usually only one does.
        // Actually, let's look for the one with text.
        if (source === 'GhanaWeb') {
            // Iterate to find the best candidate
            let bestLen = 0;
            $(contentSelector).each((i, el) => {
                const len = $(el).text().trim().length;
                if (len > bestLen) {
                    bestLen = len;
                    contentEl = $(el);
                }
            });
        }

        if (contentEl.length) {
            contentEl.find('script, style, iframe, .related-posts, .ads, .ad, [class*="ad-"], [id*="ad-"]').remove();
            const paragraphs: string[] = [];
            contentEl.find('p').each((_, el) => {
                const text = $(el).text().trim();
                if (text.length > 20) {
                    paragraphs.push(`<p>${text}</p>`);
                }
            });
            content = paragraphs.join('');
        }

        if (!content || content.length < 100) {
            const dom = new JSDOM(html, { url: link });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            if (article && article.content) {
                content = article.content;
            }
        }

        return { image, timestamp, time, content };
    } catch (e) {
        console.error(`Error fetching metadata for ${link}:`, e);
        return { image: null };
    }
}

async function scrapeGhanaWeb() {
    console.log('Scraping GhanaWeb...');
    const sections = [
        { name: 'News', url: 'https://www.ghanaweb.com/GhanaHomePage/NewsArchive/' },
        { name: 'Sports', url: 'https://www.ghanaweb.com/GhanaHomePage/SportsArchive/' },
        { name: 'Business', url: 'https://www.ghanaweb.com/GhanaHomePage/business/' }
    ];

    const stories: Story[] = [];
    const seenLinks = new Set<string>();

    // Manual addition of specific articles to rescue
    const manualLinks = [
        'https://www.ghanaweb.com/GhanaHomePage/business/Ghana-Shippers-Authority-CEO-seeks-Otumfuor-s-support-for-the-completion-of-Boankra-project-2017827'
    ];

    for (const lnk of manualLinks) {
        stories.push({
            id: `gw-manual-${Math.random()}`,
            source: 'GhanaWeb',
            title: 'Manual Fetch', // will be updated by metadata
            link: lnk,
            image: null,
            time: 'Recent',
            timestamp: Date.now(),
            section: 'Business'
        });
    }

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
                if (!image) image = $(el).closest('div, li').find('img').attr('src');

                let dateStr = $(el).find('.date, .time, time, .published, .post-date').first().text().trim();
                if (!dateStr) dateStr = $(el).find('time').attr('datetime') || '';
                const { timestamp, display } = parsePublicationDate(dateStr);

                const hasArticleId = link?.includes('artikel.php?ID=') || /\/\d{7,}-/.test(link || '');
                const hasSvgImage = image?.toLowerCase().endsWith('.svg');

                if (link && title && title.length > 10 && !link.includes('javascript') && hasArticleId && !hasSvgImage) {
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

    // For simplicity, we just process all found ones.
    console.log(`Found ${stories.length} candidates from GhanaWeb.`);

    // Fetch deep metadata
    for (const story of stories) {
        const metadata = await fetchArticleMetadata(story.link, story.source);
        if (metadata.timestamp && metadata.time) {
            story.timestamp = metadata.timestamp;
            story.time = metadata.time;
        }
        if (metadata.image) story.image = metadata.image;
        if (metadata.content) story.content = metadata.content;
    }

    // Filter valid ones
    const storiesWithContent = stories.filter(s => s.content && s.content.length > 200);
    console.log(`Stories with valid content: ${storiesWithContent.length}`);

    if (storiesWithContent.length > 0) {
        const count = await insertArticles(storiesWithContent as any[]);
        console.log(`Inserted ${count} articles.`);
    }
}

scrapeGhanaWeb();
