
const https = require('https');
const cheerio = require('cheerio');

async function debugLinks() {
    https.get('https://citinewsroom.com/feed/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
            const $ = cheerio.load(data, { xmlMode: true });
            $('item').slice(0, 5).each((i, el) => {
                const link = $(el).find('link').text().trim();
                const guid = $(el).find('guid').text().trim();
                console.log(`RSS Link [${i}]: ${link}`);
                console.log(`RSS Guid [${i}]: ${guid}`);
            });
        });
    });
}
debugLinks();
