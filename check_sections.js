
const https = require('https');

const feeds = [
    // Adom
    'https://www.adomonline.com/category/news/feed/',
    'https://www.adomonline.com/category/sports/feed/',
    'https://www.adomonline.com/category/business/feed/',

    // MyJoy - checking if category feeds exist
    'https://www.myjoyonline.com/category/news/feed/',
    'https://www.myjoyonline.com/category/sports/feed/',
    'https://www.myjoyonline.com/category/business/feed/',
    'https://www.myjoyonline.com/news/feed/', // Alternative guess

    // PeaceFM - checking if they have RSS for sections
    'https://www.peacefmonline.com/pages/news/rss.xml',
    'https://www.peacefmonline.com/pages/sports/rss.xml'
];

async function check(url) {
    return new Promise(resolve => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode === 200) {
                console.log(`[OK] ${url}`);
            } else {
                console.log(`[${res.statusCode}] ${url}`);
            }
            resolve();
        }).on('error', () => {
            console.log(`[ERR] ${url}`);
            resolve();
        });
    });
}

(async () => {
    for (const f of feeds) await check(f);
})();
