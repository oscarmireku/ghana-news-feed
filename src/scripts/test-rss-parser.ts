import 'dotenv/config';
import Parser from 'rss-parser';

async function testRSSParser() {
    const parser = new Parser({
        timeout: 20000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    const feeds = [
        { name: 'MyJoyOnline', url: 'https://www.myjoyonline.com/feed/' },
        { name: 'Yen.com.gh', url: 'https://yen.com.gh/rss/all.rss' },
        { name: 'Pulse.com.gh', url: 'https://www.pulse.com.gh/rss-articles.xml' },
        { name: '3News', url: 'https://3news.com/feed/' },
        { name: 'DailyGuide', url: 'https://dailyguidenetwork.com/feed/' }
    ];

    for (const feed of feeds) {
        try {
            console.log(`\n--- Testing ${feed.name} with rss-parser ---`);
            const result = await parser.parseURL(feed.url);
            console.log(`✓ SUCCESS: Found ${result.items.length} items`);
            if (result.items.length > 0) {
                console.log(`  First item: ${result.items[0].title}`);
            }
        } catch (error: any) {
            console.error(`✗ FAILED: ${error.message}`);
        }
    }
}

testRSSParser();
