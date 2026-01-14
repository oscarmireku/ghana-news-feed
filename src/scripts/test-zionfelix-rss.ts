import * as cheerio from 'cheerio';

async function testZionRSS() {
    const url = 'https://www.zionfelix.net/feed/';
    console.log(`Fetching RSS: ${url}`);

    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        console.log(`Status: ${res.status}`);

        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        const items = $('item');
        console.log(`Found ${items.length} items.\n`);

        items.slice(0, 3).each((i, el) => {
            console.log(`--- Item ${i + 1} ---`);
            console.log(`Title:   ${$(el).find('title').text().trim()}`);
            console.log(`Link:    ${$(el).find('link').text().trim()}`);
            console.log(`PubDate: ${$(el).find('pubDate').text().trim()}`);
            console.log(`Image:   ${$(el).find('media\\:content').attr('url') || $(el).find('media\\:thumbnail').attr('url')}`);
            // Check for content encoded image if media tags are missing
            const content = $(el).find('content\\:encoded').text();
            const match = content.match(/src="([^"]+)"/);
            if (match) console.log(`ContentUpdatedImage: ${match[1]}`);
        });

    } catch (e) {
        console.error("Error fetching RSS:", e);
    }
}

testZionRSS();
