
const https = require('https');

https.get('https://citinewsroom.com/feed/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log(data.substring(0, 2000)); // Print first 2000 chars of XML
    });
});
