
const https = require('https');
const cheerio = require('cheerio');

async function checkCiti() {
    return new Promise((resolve) => {
        https.get('https://citinewsroom.com/feed/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const $ = cheerio.load(data, { xmlMode: true });
                const item = $('item').first();
                console.log('Title:', item.find('title').text());
                console.log('Media Content:', item.find('media\\:content').attr('url'));
                console.log('Media Thumbnail:', item.find('media\\:thumbnail').attr('url'));
                // Check description for img
                const desc = item.find('description').text();
                const descImg = desc.match(/src="([^"]+)"/);
                console.log('Description first img:', descImg ? descImg[1] : 'None');

                // Check content:encoded
                const content = item.find('content\\:encoded').text();
                const contentImg = content.match(/src="([^"]+)"/);
                console.log('Content first img:', contentImg ? contentImg[1] : 'None');
                resolve();
            });
        });
    });
}
checkCiti();
