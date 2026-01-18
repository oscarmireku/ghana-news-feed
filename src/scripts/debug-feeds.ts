
import { rateLimitedFetch } from '../lib/rate-limited-fetch';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

// Copied from scrape-standalone.ts
function parsePublicationDate(dateStr: string): { timestamp: number; display: string } {
    if (!dateStr || dateStr.trim() === '') {
        return { timestamp: Date.now(), display: 'Recent' };
    }

    let cleaned = dateStr.trim();
    const hasTimezone = /GMT|UTC|Z|[+-]\d{2}:?\d{2}/.test(cleaned);

    if (!hasTimezone) {
        cleaned += ' GMT';
    }

    const d = new Date(cleaned);

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

    return { timestamp: Date.now(), display: 'Recent' };
}


async function testFeed(name: string, url: string) {
    const result: any = { name, url, error: null, status: 0, itemsFound: 0, firstItem: null, sampleRaw: '' };
    try {
        const res = await rateLimitedFetch(url, { skipCache: true });
        result.status = res.status;

        if (!res.ok) {
            result.error = `Failed to fetch: ${res.statusText}`;
            return result;
        }

        const text = await res.text();
        result.sampleRaw = text.substring(0, 500);

        // Try parsing
        const $ = cheerio.load(text, { xmlMode: true });
        let items = $('item');
        if (items.length === 0) items = $('entry'); // Atom fallback

        result.itemsFound = items.length;

        if (items.length > 0) {
            items.slice(0, 5).each((i, el) => {
                const item = $(el);
                const title = item.find('title').text();

                // Image extraction logic from scraper
                let image = item.find('media\\:content').attr('url') ||
                    item.find('media\\:thumbnail').attr('url');

                if (!image) {
                    const content = item.find('content\\:encoded').text();
                    const match = content.match(/src="([^"]+)"/);
                    if (match) image = match[1];
                }

                // Date extraction
                let pubDate = '';
                const isAtom = items.get(0).tagName === 'entry';
                if (isAtom) {
                    pubDate = item.find('published').text() || item.find('updated').text();
                } else {
                    pubDate = item.find('pubDate').text().trim();
                }

                const parsed = parsePublicationDate(pubDate);
                const ageHours = (Date.now() - parsed.timestamp) / (1000 * 60 * 60);

                console.log(`Item ${i + 1}: ${title.substring(0, 30)}...`);
                console.log(`   - Date Raw: '${pubDate}'`);
                console.log(`   - Parsed: ${new Date(parsed.timestamp).toString()} (Age: ${ageHours.toFixed(1)} hours)`);

                // Image extraction logic from scraper
                image = item.find('media\\:content').attr('url') ||
                    item.find('media\\:thumbnail').attr('url');

                if (!image) {
                    const content = item.find('content\\:encoded').text();
                    const match = content.match(/src="([^"]+)"/);
                    if (match) image = match[1];
                }

                console.log(`   - Image: ${image ? 'FOUND' : 'MISSING'} (${image || ''})`);
            });

            const first = items.first();
            result.firstItem = {
                title: first.find('title').text(),
                link: first.find('link').text() || first.find('link').attr('href')
            };
        } else {
            // Check if it's HTML
            const $html = cheerio.load(text);
            result.htmlTitle = $html('title').text();
        }

    } catch (e: any) {
        result.error = e.message;
    }
    return result;
}

async function main() {
    const joy = await testFeed('MyJoyOnline', 'https://www.myjoyonline.com/feed/');
    const nom = await testFeed('Nkonkonsa', 'https://nkonkonsa.com/feed/');

    fs.writeFileSync('debug_result.json', JSON.stringify([joy, nom], null, 2));
    console.log("Done");
}

main();
