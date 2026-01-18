
import { fetchRSS } from '../lib/rss';

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
    { source: 'Happy Ghana', url: 'https://www.happyghana.com/feed/', section: 'News' },
    { source: 'ZionFelix', url: 'https://www.zionfelix.net/feed/', section: 'Entertainment' },
    { source: 'Nkonkonsa', url: 'https://nkonkonsa.com/feed/', section: 'Entertainment' }
];

async function checkDates() {
    console.log('Checking Dates for RSS Feeds...');

    for (const feed of GENERIC_FEEDS) {
        // limit 1 just to check format
        try {
            const items = await fetchRSS(feed.url, feed.source, feed.section);
            if (items.length > 0) {
                const item = items[0];
                console.log(`[${feed.source}] PubDate: "${item.pubDate}", IsoDate: "${item.isoDate}"`);
            } else {
                console.log(`[${feed.source}] No items found.`);
            }
        } catch (e) {
            console.error(`[${feed.source}] Error:`, e.message);
        }
    }
}

checkDates();
