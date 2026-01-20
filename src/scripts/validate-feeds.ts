import { fetchRSS } from '../lib/rss';
import { getAllLinks, getLatestTimestampsBySource } from '../lib/db';

const GENERIC_FEEDS = [
    { source: '3News', url: 'https://3news.com/feed/', section: 'News' },
    { source: 'Tech Labari', url: 'https://techlabari.com/feed/', section: 'Tech' },
    { source: 'News Ghana', url: 'https://newsghana.com.gh/feed/', section: 'News' },
    { source: 'DailyGuide', url: 'https://dailyguidenetwork.com/feed/', section: 'News' },
    { source: 'Modern Ghana', url: 'https://www.modernghana.com/rssfeed/news.xml', section: 'News' },
    { source: 'GNA', url: 'https://gna.org.gh/feed/', section: 'News' },
    { source: 'Graphic Online', url: 'https://www.graphic.com.gh/news/general-news?format=feed', section: 'News' },
    { source: 'Ghanaian Times', url: 'https://www.ghanaiantimes.com.gh/feed/', section: 'News' },
    { source: 'Starr FM', url: 'https://starrfm.com.gh/feed/', section: 'News' },
    { source: 'The B&FT', url: 'https://thebftonline.com/feed/', section: 'Business' },
    { source: 'Atinka Online', url: 'https://atinkaonline.com/feed/', section: 'News' },
    { source: 'Asaase Radio', url: 'https://asaaseradio.com/feed/', section: 'News' },
    { source: 'The Herald', url: 'https://theheraldghana.com/feed/', section: 'News' },
    { source: 'The Chronicle', url: 'https://thechronicle.com.gh/feed/', section: 'News' },
    { source: 'GhPage', url: 'https://ghpage.com/feed/', section: 'Entertainment' },
    { source: 'Ameyaw Debrah', url: 'https://ameyawdebrah.com/feed/', section: 'Entertainment' },
    { source: 'YFM Ghana', url: 'https://yfmghana.com/feed/', section: 'Entertainment' },
    { source: 'ZionFelix', url: 'https://www.zionfelix.net/feed/', section: 'Entertainment' },
    { source: 'Nkonkonsa', url: 'https://nkonkonsa.com/feed/', section: 'Entertainment' },
    { source: 'MyJoyOnline', url: 'https://www.myjoyonline.com/feed/', section: 'News' },
    { source: 'GhanaSoccerNet', url: 'https://ghanasoccernet.com/feed', section: 'Sports' }
];

interface FeedValidationResult {
    source: string;
    status: 'SUCCESS' | 'FAILED';
    itemCount: number;
    hasImages: number;
    hasValidDates: number;
    error?: string;
    sampleItem?: any;
}

async function validateFeed(feed: { source: string; url: string; section: string }): Promise<FeedValidationResult> {
    try {
        const items = await fetchRSS(feed.url, feed.source, feed.section);

        if (items.length === 0) {
            return {
                source: feed.source,
                status: 'FAILED',
                itemCount: 0,
                hasImages: 0,
                hasValidDates: 0,
                error: 'No items returned from feed'
            };
        }

        const hasImages = items.filter(item => item.imageUrl && item.imageUrl.trim() !== '').length;
        const hasValidDates = items.filter(item => {
            if (!item.pubDate) return false;
            const date = new Date(item.pubDate);
            return !isNaN(date.getTime());
        }).length;

        return {
            source: feed.source,
            status: 'SUCCESS',
            itemCount: items.length,
            hasImages,
            hasValidDates,
            sampleItem: items[0]
        };
    } catch (error) {
        return {
            source: feed.source,
            status: 'FAILED',
            itemCount: 0,
            hasImages: 0,
            hasValidDates: 0,
            error: (error as Error).message
        };
    }
}

async function main() {
    console.log('='.repeat(80));
    console.log('RSS FEED VALIDATION DIAGNOSTIC');
    console.log('='.repeat(80));
    console.log('');

    const results: FeedValidationResult[] = [];

    for (const feed of GENERIC_FEEDS) {
        console.log(`Testing ${feed.source}...`);
        const result = await validateFeed(feed);
        results.push(result);

        if (result.status === 'SUCCESS') {
            console.log(`  ✓ SUCCESS: ${result.itemCount} items, ${result.hasImages} with images, ${result.hasValidDates} with valid dates`);
        } else {
            console.log(`  ✗ FAILED: ${result.error}`);
        }
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log('');

    const successful = results.filter(r => r.status === 'SUCCESS');
    const failed = results.filter(r => r.status === 'FAILED');

    console.log(`Total Feeds: ${results.length}`);
    console.log(`Successful: ${successful.length} (${((successful.length / results.length) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failed.length} (${((failed.length / results.length) * 100).toFixed(1)}%)`);
    console.log('');

    if (failed.length > 0) {
        console.log('FAILED FEEDS:');
        failed.forEach(f => {
            console.log(`  - ${f.source}: ${f.error}`);
        });
        console.log('');
    }

    // Check database for articles from each source
    console.log('='.repeat(80));
    console.log('DATABASE CHECK');
    console.log('='.repeat(80));
    console.log('');

    const sourceTimestamps = await getLatestTimestampsBySource();
    const existingLinks = await getAllLinks();

    console.log(`Total articles in database: ${existingLinks.size}`);
    console.log('');
    console.log('Latest article per source:');

    for (const feed of GENERIC_FEEDS) {
        const lastSeen = sourceTimestamps.get(feed.source);
        if (lastSeen) {
            const age = Date.now() - lastSeen;
            const hours = Math.floor(age / (1000 * 60 * 60));
            console.log(`  ${feed.source}: ${hours}h ago (${new Date(lastSeen).toISOString()})`);
        } else {
            console.log(`  ${feed.source}: NO ARTICLES FOUND ⚠️`);
        }
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('RECOMMENDATIONS');
    console.log('='.repeat(80));
    console.log('');

    const noArticles = GENERIC_FEEDS.filter(f => !sourceTimestamps.has(f.source));
    const oldArticles = GENERIC_FEEDS.filter(f => {
        const lastSeen = sourceTimestamps.get(f.source);
        if (!lastSeen) return false;
        const age = Date.now() - lastSeen;
        return age > 24 * 60 * 60 * 1000; // Older than 24 hours
    });

    if (noArticles.length > 0) {
        console.log('⚠️  Sources with NO articles in database:');
        noArticles.forEach(f => console.log(`   - ${f.source}`));
        console.log('');
    }

    if (oldArticles.length > 0) {
        console.log('⚠️  Sources with articles older than 24 hours:');
        oldArticles.forEach(f => console.log(`   - ${f.source}`));
        console.log('');
    }

    if (failed.length === 0 && noArticles.length === 0 && oldArticles.length === 0) {
        console.log('✓ All feeds are healthy!');
    }
}

main().catch(console.error);
