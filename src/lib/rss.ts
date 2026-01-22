import Parser from 'rss-parser';
import { parseRSSWithCheerio } from './cheerio-rss-parser';

export type NewsItem = {
    title: string;
    link: string;
    pubDate: string;
    content: string;
    contentSnippet: string;
    source: string;
    isoDate?: string;
    imageUrl?: string;
    category?: string;
};

const parser = new Parser({
    timeout: 20000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    xml2js: {
        strict: false, // Allow messy XML
        normalizeTags: true, // Lowercase tag names
        normalize: true, // Trim whitespace
        explicitArray: false, // Don't wrap single items in arrays
    },
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['enclosure', 'enclosure'],
            ['dc:creator', 'creator'],
            ['content:encoded', 'contentEncoded'],
        ],
    },
});

function extractImage(item: any): string | undefined {
    if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
        return item.mediaContent.$.url;
    }
    if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
        return item.mediaThumbnail.$.url;
    }
    if (item.enclosure && item.enclosure.url) {
        return item.enclosure.url;
    }
    // Fallback: try to find an image tag in content
    const content = item.contentEncoded || item.content || '';
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch) {
        return imgMatch[1];
    }
    return undefined;
}

export async function fetchRSS(url: string, sourceName: string, category: string = 'General'): Promise<NewsItem[]> {
    try {
        // Try standard rss-parser first
        const feed = await parser.parseURL(url);
        const items = feed.items.map((item: any) => ({
            title: item.title || 'No Title',
            link: item.link || '#',
            pubDate: item.pubDate || new Date().toISOString(),
            isoDate: item.isoDate,
            content: item.contentEncoded || item.content || item.contentSnippet || '',
            contentSnippet: item.contentSnippet || '',
            source: sourceName,
            category: category,
            imageUrl: extractImage(item),
        }));

        if (items.length > 0) {
            return items;
        }

        // If we got 0 items, try fallback parser
        console.log(`[RSS] Standard parser returned 0 items for ${sourceName}, trying fallback...`);
        throw new Error('No items found, trying fallback');

    } catch (error: any) {
        // Fallback to Cheerio-based parser
        console.log(`[RSS] Standard parser failed for ${sourceName}: ${error.message}. Trying Cheerio fallback...`);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const xmlContent = await response.text();
            const parsedItems = await parseRSSWithCheerio(xmlContent);

            const items = parsedItems.map(item => ({
                title: item.title,
                link: item.link,
                pubDate: item.pubDate || new Date().toISOString(),
                isoDate: item.pubDate,
                content: item.content || item.description || '',
                contentSnippet: item.description || '',
                source: sourceName,
                category: item.category || category,
                imageUrl: item.imageUrl,
            }));

            console.log(`[RSS] ✓ Cheerio fallback succeeded for ${sourceName}: ${items.length} items`);
            return items;

        } catch (fallbackError: any) {
            console.error(`[RSS] ✗ Both parsers failed for ${sourceName}: ${fallbackError.message}`);
            return [];
        }
    }
}
