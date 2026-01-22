import 'dotenv/config';
import { fetchRSS } from '../lib/rss';

async function testEnhancedParser() {
    const feeds = [
        { name: 'MyJoyOnline', url: 'https://www.myjoyonline.com/feed/' },
        { name: 'Yen.com.gh', url: 'https://yen.com.gh/rss/all.rss' },
        { name: 'Pulse.com.gh', url: 'https://www.pulse.com.gh/rss-articles.xml' },
        { name: '3News', url: 'https://3news.com/feed/' },
        { name: 'DailyGuide', url: 'https://dailyguidenetwork.com/feed/' },
        { name: 'Starr FM', url: 'https://starrfm.com.gh/feed/' },
    ];

    console.log('Testing Enhanced RSS Parser with Fallback\n');
    console.log('='.repeat(60));

    for (const feed of feeds) {
        try {
            const items = await fetchRSS(feed.url, feed.name, 'News');
            console.log(`\n✓ ${feed.name}: ${items.length} articles`);
            if (items.length > 0) {
                console.log(`  First: ${items[0].title.substring(0, 60)}...`);
            }
        } catch (error: any) {
            console.error(`\n✗ ${feed.name}: FAILED - ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(60));
}

testEnhancedParser();
