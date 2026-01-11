import * as cheerio from 'cheerio';

async function testGhanaSoccerNet() {
    const url = 'https://ghanasoccernet.com/feed';

    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        const item = $('item').first();

        console.log('=== Testing Image Extraction ===\n');

        // Test media:content
        const mediaContent = item.find('media\\:content').attr('url');
        console.log('media:content url:', JSON.stringify(mediaContent));
        console.log('After trim:', JSON.stringify(mediaContent?.trim()));

        // Test media:thumbnail  
        const mediaThumbnail = item.find('media\\:thumbnail').attr('url');
        console.log('\nmedia:thumbnail url:', JSON.stringify(mediaThumbnail));
        console.log('After trim:', JSON.stringify(mediaThumbnail?.trim()));

        // Test enclosure
        const enclosure = item.find('enclosure').attr('url');
        console.log('\nenclosure url:', JSON.stringify(enclosure));
        console.log('After trim:', JSON.stringify(enclosure?.trim()));

        // Test description content
        const description = item.find('description').text();
        console.log('\nDescription length:', description.length);
        const match = description.match(/src="([^"]+)"/);
        if (match) {
            console.log('Image from description:', JSON.stringify(match[1]));
            console.log('After trim:', JSON.stringify(match[1].trim()));
        }

    } catch (e: any) {
        console.log(`Error: ${e.message}`);
    }
}

testGhanaSoccerNet();
