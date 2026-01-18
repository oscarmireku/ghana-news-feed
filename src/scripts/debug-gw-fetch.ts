import { db } from '../lib/db';
import { scrapeGhanaWeb } from './scrape-standalone';

async function testGW() {
    console.log('Scraping GhanaWeb...');
    const stories = await scrapeGhanaWeb();

    console.log(`Found ${stories.length} stories.`);

    if (stories.length > 0) {
        console.log('Top 10 Stories:');
        console.log(JSON.stringify(stories.slice(0, 10), null, 2));
    }
}

testGW();
