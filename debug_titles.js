
const https = require('https');
const cheerio = require('cheerio');

async function debugTitles() {
    console.log('--- Fetching RSS ---');
    const rssPromise = new Promise(resolve => {
        https.get('https://citinewsroom.com/feed/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
    });

    console.log('--- Fetching HTML ---');
    const htmlPromise = new Promise(resolve => {
        https.get('https://citinewsroom.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
    });

    const [rssXml, html] = await Promise.all([rssPromise, htmlPromise]);

    const $rss = cheerio.load(rssXml, { xmlMode: true });
    const $html = cheerio.load(html);

    console.log('--- RSS Titles ---');
    const rssTitles = [];
    $rss('item').slice(0, 5).each((i, el) => {
        const t = $rss(el).find('title').text().trim();
        rssTitles.push(t);
        console.log(`[RSS ${i}] "${t}" len=${t.length}`);
    });

    console.log('--- HTML Titles ---');
    $html('.jeg_post').slice(0, 5).each((i, el) => {
        const t = $html(el).find('.jeg_post_title a').text().trim();
        console.log(`[HTML ${i}] "${t}" len=${t.length}`);

        // check match
        const match = rssTitles.find(rt => rt === t);
        console.log(`   Match found: ${!!match}`);
    });
}

debugTitles();
