
import { rateLimitedFetch } from '../lib/rate-limited-fetch';
import * as cheerio from 'cheerio';

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

async function debugCiti() {
    console.log("Fetching CitiNewsRoom...");
    const res = await rateLimitedFetch('https://citinewsroom.com/news/', { skipCache: true });
    const html = await res.text();
    const $ = cheerio.load(html);

    console.log("Processing articles...");
    $('.jeg_post').slice(0, 5).each((i, el) => {
        const title = $(el).find('.jeg_post_title a').first().text().trim();
        const dateStr = $(el).find('.jeg_meta_date').text().trim();
        const parsed = parsePublicationDate(dateStr);

        console.log(`[${i}] ${title}`);
        console.log(`    Date String: '${dateStr}'`);
        console.log(`    Parsed: ${parsed.display} (${parsed.timestamp})`);
        if (parsed.display === 'Recent') console.log("    -> FAILED PARSE (using Now)");
    });
}

debugCiti();
