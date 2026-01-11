
const https = require('https');
const cheerio = require('cheerio');

async function checkJoy() {
    return new Promise((resolve) => {
        https.get('https://www.myjoyonline.com/feed/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const $ = cheerio.load(data, { xmlMode: true });
                $('item').slice(0, 3).each((i, el) => {
                    const node = $(el);
                    console.log(`[${i}] Title: ${node.find('title').text()}`);
                    // Check various image sources
                    const thumb = node.find('media\\:thumbnail').attr('url');
                    const content = node.find('media\\:content').attr('url');
                    const desc = node.find('description').text();
                    const descImg = desc.match(/src="([^"]+)"/);

                    console.log(`    Media Thumb: ${thumb}`);
                    console.log(`    Media Content: ${content}`);
                    console.log(`    Desc Img: ${descImg ? descImg[1] : 'None'}`);
                });
                resolve();
            });
        });
    });
}
checkJoy();
