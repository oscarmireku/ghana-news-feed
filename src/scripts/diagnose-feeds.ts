import 'dotenv/config';

async function testFeeds() {
    const feeds = [
        { name: 'MyJoyOnline', url: 'https://www.myjoyonline.com/feed/' },
        { name: 'Yen.com.gh', url: 'https://yen.com.gh/rss/all.rss' },
        { name: 'Pulse.com.gh', url: 'https://www.pulse.com.gh/rss-articles.xml' },
        { name: '3News', url: 'https://3news.com/feed/' },
        { name: 'DailyGuide', url: 'https://dailyguidenetwork.com/feed/' }
    ];

    for (const feed of feeds) {
        try {
            console.log(`\n--- Testing ${feed.name} ---`);
            const response = await fetch(feed.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            console.log(`Status: ${response.status}`);
            console.log(`Content-Type: ${response.headers.get('content-type')}`);

            const text = await response.text();
            console.log(`Response length: ${text.length} bytes`);
            console.log(`First 200 chars: ${text.substring(0, 200)}`);

            // Check if it's valid XML
            if (text.includes('<?xml') || text.includes('<rss') || text.includes('<feed')) {
                console.log('✓ Appears to be valid XML/RSS');
            } else {
                console.log('✗ Does NOT appear to be valid XML/RSS');
            }

        } catch (error) {
            console.error(`Error: ${error}`);
        }
    }
}

testFeeds();
