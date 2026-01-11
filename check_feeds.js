
const https = require('https');

const feeds = [
    'https://www.ghanaweb.com/GhanaHomePage/rss/rss.xml', // Common for older sites
    'https://www.ghanaweb.com/feed',
    'https://www.urstrulypraiz.com/feed/', // Wait, user said adomonline.com
    'https://www.adomonline.com/feed/',
    'https://www.peacefmonline.com/feed/',
    'https://www.peacefmonline.com/rss'
];

async function checkFeed(url) {
    return new Promise(resolve => {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200 && data.includes('<rss') || data.includes('<feed')) {
                    console.log(`[SUCCESS] ${url} (Size: ${data.length})`);
                    // Peek at content
                    console.log(data.substring(0, 500).replace(/\n/g, ' '));
                } else {
                    console.log(`[FAILED] ${url} (Status: ${res.statusCode})`);
                }
                resolve();
            });
        });
        req.on('error', e => {
            console.log(`[ERROR] ${url}: ${e.message}`);
            resolve();
        });
    });
}

async function run() {
    for (const feed of feeds) {
        await checkFeed(feed);
    }
}
run();
