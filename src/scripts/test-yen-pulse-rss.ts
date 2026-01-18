import { fetchRSS } from '../lib/rss';

async function test() {
    console.log('Testing Yen and Pulse RSS feeds...');

    // Test Yen
    console.log('\n--- Yen ---');
    try {
        const yenItems = await fetchRSS('https://yen.com.gh/rss/all.rss', 'Yen', 'News');
        console.log(`Fetched ${yenItems.length} items from Yen.`);
        if (yenItems.length > 0) {
            console.log('Sample item:', JSON.stringify(yenItems[0], null, 2));
        }
    } catch (e) {
        console.error('Yen Error:', e);
    }

    // Test Pulse
    console.log('\n--- Pulse ---');
    try {
        const pulseItems = await fetchRSS('https://www.pulse.com.gh/rss-articles.xml', 'Pulse', 'News');
        console.log(`Fetched ${pulseItems.length} items from Pulse.`);
        if (pulseItems.length > 0) {
            console.log('Sample item:', JSON.stringify(pulseItems[0], null, 2));
        }
    } catch (e) {
        console.error('Pulse Error:', e);
    }
}

test().catch(console.error);
