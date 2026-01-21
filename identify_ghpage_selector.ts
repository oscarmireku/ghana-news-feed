
import * as cheerio from 'cheerio';

async function main() {
    try {
        const url = 'https://www.ghpage.com/yaw-dabo-sues-oboy-siki-for-calling-him-kte-ketewa-among-others/339202/';
        console.log(`Fetching ${url}...`);
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();
        const $ = cheerio.load(html);

        console.log('Analyzing selectors...');
        const potentialSelectors = [
            '.entry-content',
            '.post-content',
            '.td-post-content',
            '.article-content',
            'article',
            '#content',
            '.jeg_post_content' // Common in JNews themes
        ];

        potentialSelectors.forEach(sel => {
            const el = $(sel);
            if (el.length > 0) {
                console.log(`[MATCH] ${sel}: Found ${el.length} elements.`);
                console.log(`Snippet: ${el.first().text().substring(0, 100).replace(/\s+/g, ' ')}...`);
            } else {
                console.log(`[NO] ${sel}`);
            }
        });

    } catch (e) {
        console.error(e);
    }
}

main();
