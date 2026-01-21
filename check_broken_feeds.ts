
import 'dotenv/config';
import { fetchRSS } from './src/lib/rss';

const feeds = [
    // Potentially broken (0 articles in DB)
    { source: 'GNA', url: 'https://gna.org.gh/feed/', section: 'News' },
    { source: 'News Ghana', url: 'https://newsghana.com.gh/feed/', section: 'News' },
    { source: 'The Herald', url: 'https://theheraldghana.com/feed/', section: 'News' },

    // Missing from cron (check if feeds are valid)
    { source: 'Tech Labari', url: 'https://techlabari.com/feed/', section: 'Tech' },
    { source: 'ZionFelix', url: 'https://www.zionfelix.net/feed/', section: 'Entertainment' },
    { source: 'Nkonkonsa', url: 'https://nkonkonsa.com/feed/', section: 'Entertainment' }
];

async function main() {
    console.log("Checking potentially problematic feeds...");

    for (const feed of feeds) {
        try {
            console.log(`\n--- Only checking ${feed.source} ---`);
            const items = await fetchRSS(feed.url, feed.source, feed.section);
            console.log(`[SUCCESS] ${feed.source}: Fetched ${items.length} items.`);
            if (items.length > 0) {
                console.log(`    Latest: ${items[0].title}`);
                console.log(`    Date: ${items[0].pubDate}`);
            }
        } catch (error) {
            console.error(`[FAILED] ${feed.source}:`, error.message);
        }
    }
}

main();
