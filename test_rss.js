
const cheerio = require('cheerio');
const https = require('https');

async function fetchFeed(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        });
    });
}

async function testFeeds() {
    console.log('--- Testing MyJoyOnline RSS ---');
    try {
        const joyXml = await fetchFeed('https://www.myjoyonline.com/feed/');
        const $joy = cheerio.load(joyXml, { xmlMode: true });
        $joy('item').slice(0, 3).each((i, el) => {
            const title = $joy(el).find('title').text();
            const link = $joy(el).find('link').text();
            const pubDate = $joy(el).find('pubDate').text();
            // Try to find image in media:content or description
            let image = $joy(el).find('media\\:content, content').attr('url');
            // Note: cheerio might need escaping for namespaced tags or just use simple selector if possible
            if (!image) {
                const desc = $joy(el).find('description').text();
                const imgMatch = desc.match(/src="([^"]+)"/);
                if (imgMatch) image = imgMatch[1];
            }
            console.log(`[Joy ${i}] ${title}`);
            console.log(`       Date: ${pubDate}`);
            console.log(`       Image: ${image}`);
        });
    } catch (e) {
        console.error('Joy Error:', e.message);
    }

    console.log('\n--- Testing CitiNewsRoom RSS ---');
    try {
        const citiXml = await fetchFeed('https://citinewsroom.com/feed/');
        const $citi = cheerio.load(citiXml, { xmlMode: true });
        $citi('item').slice(0, 3).each((i, el) => {
            const title = $citi(el).find('title').text();
            const link = $citi(el).find('link').text();
            const pubDate = $citi(el).find('pubDate').text();
            let image = $citi(el).find('media\\:content').attr('url');
            if (!image) {
                const desc = $citi(el).find('description').text();
                const imgMatch = desc.match(/src="([^"]+)"/);
                if (imgMatch) image = imgMatch[1];
            }
            console.log(`[Citi ${i}] ${title}`);
            console.log(`       Date: ${pubDate}`);
            console.log(`       Image: ${image}`);
        });
    } catch (e) {
        console.error('Citi Error:', e.message);
    }
}

testFeeds();
