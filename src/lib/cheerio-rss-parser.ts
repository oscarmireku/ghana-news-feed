import * as cheerio from 'cheerio';

export interface ParsedRSSItem {
    title: string;
    link: string;
    pubDate: string;
    description?: string;
    content?: string;
    imageUrl?: string;
    category?: string;
}

/**
 * Manual RSS/Atom parser using Cheerio as fallback when rss-parser fails.
 * Handles RSS 2.0, RSS 1.0, and Atom 1.0 formats.
 */
export async function parseRSSWithCheerio(xmlContent: string): Promise<ParsedRSSItem[]> {
    const $ = cheerio.load(xmlContent, { xmlMode: true });
    const items: ParsedRSSItem[] = [];

    // Detect feed type
    const isAtom = $('feed').length > 0;
    const isRSS1 = $('rdf\\:RDF').length > 0 || $('RDF').length > 0;

    if (isAtom) {
        // Parse Atom feed
        $('entry').each((_, el) => {
            const $el = $(el);

            const title = $el.find('title').first().text().trim();
            const link = $el.find('link[rel="alternate"]').attr('href') ||
                $el.find('link').first().attr('href') || '';
            const pubDate = $el.find('published').first().text().trim() ||
                $el.find('updated').first().text().trim();
            const description = $el.find('summary').first().text().trim();
            const content = $el.find('content').first().text().trim();

            // Try to find image
            let imageUrl = $el.find('media\\:thumbnail').attr('url') ||
                $el.find('media\\:content').attr('url');

            if (!imageUrl && content) {
                const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
                if (imgMatch) imageUrl = imgMatch[1];
            }

            if (title && link) {
                items.push({
                    title,
                    link,
                    pubDate,
                    description,
                    content: content || description,
                    imageUrl,
                });
            }
        });
    } else {
        // Parse RSS 2.0 or RSS 1.0
        const itemSelector = isRSS1 ? 'item, rdf\\:item' : 'item';

        $(itemSelector).each((_, el) => {
            const $el = $(el);

            const title = $el.find('title').first().text().trim();
            const link = $el.find('link').first().text().trim() ||
                $el.find('guid').first().text().trim();
            const pubDate = $el.find('pubDate').first().text().trim() ||
                $el.find('dc\\:date').first().text().trim() ||
                $el.find('date').first().text().trim();
            const description = $el.find('description').first().text().trim();
            const content = $el.find('content\\:encoded').first().text().trim() ||
                $el.find('encoded').first().text().trim();
            const category = $el.find('category').first().text().trim();

            // Try multiple image sources
            let imageUrl = $el.find('media\\:content').attr('url') ||
                $el.find('media\\:thumbnail').attr('url') ||
                $el.find('enclosure[type^="image"]').attr('url') ||
                $el.find('enclosure').attr('url');

            // Fallback: extract from content or description
            if (!imageUrl) {
                const contentToSearch = content || description;
                if (contentToSearch) {
                    const imgMatch = contentToSearch.match(/<img[^>]+src=["']([^"']+)["']/);
                    if (imgMatch) imageUrl = imgMatch[1];
                }
            }

            if (title && link) {
                items.push({
                    title,
                    link,
                    pubDate,
                    description,
                    content: content || description,
                    imageUrl,
                    category,
                });
            }
        });
    }

    return items;
}
