import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

async function runScraper() {
    console.log(`[${new Date().toISOString()}] Starting scheduled scrape...`);
    try {
        // Run scraper
        const { stdout, stderr } = await execPromise('npx tsx src/scripts/scrape-standalone.ts');
        console.log(stdout);
        if (stderr) console.error('Scraper Error:', stderr);

        // Scraper already updated the database directly, no need for additional API call
        console.log('Database updated successfully.');

    } catch (error) {
        console.error('Scheduler Error:', error);
    }
    console.log(`[${new Date().toISOString()}] Finished. Waiting 5 minutes...\n`);
}

// Run immediately
runScraper();

// Then every 5 minutes (300,000 ms)
setInterval(runScraper, 5 * 60 * 1000);
