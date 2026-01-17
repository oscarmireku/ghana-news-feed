import Parser from 'rss-parser';

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
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
    const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch) {
        return imgMatch[1];
    }
    return undefined;
}

export async function fetchRSS(url: string, sourceName: string, category: string = 'General'): Promise<NewsItem[]> {
    try {
        const feed = await parser.parseURL(url);
        return feed.items.map((item: any) => ({
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
    } catch (error) {
        console.error(`Error fetching RSS feed for ${sourceName} (${url}):`, error);
        return [];
    }
}
