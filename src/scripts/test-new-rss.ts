import { fetchRSS } from '../lib/rss';

async function test() {
    console.log('Testing new RSS logic...');

    // Test MyJoyOnline
    console.log('\n--- MyJoyOnline ---');
    const joyItems = await fetchRSS('https://www.myjoyonline.com/feed/', 'MyJoyOnline', 'News');
    console.log(`Fetched ${joyItems.length} items from MyJoyOnline.`);
    if (joyItems.length > 0) {
        console.log('Sample item:', JSON.stringify(joyItems[0], null, 2));
    }

    // Test 3News
    console.log('\n--- 3News ---');
    const threeNewsItems = await fetchRSS('https://3news.com/feed/', '3News', 'News');
    console.log(`Fetched ${threeNewsItems.length} items from 3News.`);
    if (threeNewsItems.length > 0) {
        console.log('Sample item:', JSON.stringify(threeNewsItems[0], null, 2));
    }

    // Test DailyGuide
    console.log('\n--- DailyGuide ---');
    const dailyItems = await fetchRSS('https://dailyguidenetwork.com/feed/', 'DailyGuide', 'News');
    console.log(`Fetched ${dailyItems.length} items from DailyGuide.`);
    if (dailyItems.length > 0) {
        console.log('Sample item:', JSON.stringify(dailyItems[0], null, 2));
    }
}

test().catch(console.error);
