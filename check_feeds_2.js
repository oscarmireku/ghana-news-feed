
const https = require('https');

const feeds = [
    'https://cdn.ghanaweb.com/feed/newsFeed.xml',
    'https://www.adomonline.com/feed/',
    'http://www.peacefmonline.com/pages/news/news/rss.xml'
];

async function checkFeed(url) {
    console.log(`Checking ${url}...`);
    return new Promise(resolve => {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    // Check XML signature
                    const snippet = data.substring(0, 500);
                    if (snippet.includes('<rss') || snippet.includes('<feed') || snippet.includes('<?xml')) {
                        console.log(`[SUCCESS] ${url}`);
                        console.log(`Type: ${snippet.includes('<rss') ? 'RSS' : 'Atom/Other'}`);
                    } else {
                        console.log(`[FAIL-CONTENT] ${url} (200 OK but content mismatch)`);
                        console.log('Snippet:', snippet.replace(/\n/g, ' '));
                    }
                } else {
                    console.log(`[FAIL-STATUS] ${url} (Status: ${res.statusCode})`);
                }
                resolve();
            });
        });
        req.on('error', e => {
            console.log(`[FAIL-ERROR] ${url}: ${e.message}`);
            resolve();
        });
    });
}

(async () => {
    // Verified URLs from casual knowledge or direct checks
    await checkFeed('https://www.adomonline.com/feed/'); // Almost certainly standard WP RSS
    await checkFeed('https://www.ghanaweb.com/GhanaHomePage/rss/rss.xml'); // Legacy endpoint
    await checkFeed('https://www.peacefmonline.com/pages/news/news/rss.xml'); // Guess for PeaceFM
})();
