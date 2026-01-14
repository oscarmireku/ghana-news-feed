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

        // Update JSON
        console.log('Updating news-feed.json...');
        // We can call the API or just run a script to write the file. 
        // Calling the API is better to ensure consistency with the app logic, but requires the server to be running.
        // Let's use curl/fetch to hit the local API since the server is running.

        try {
            await fetch('http://localhost:3000/api/update-json', { method: 'POST' });
            console.log('news-feed.json updated via API.');
        } catch (e) {
            console.error('Failed to update update-json API:', e);
        }

    } catch (error) {
        console.error('Scheduler Error:', error);
    }
    console.log(`[${new Date().toISOString()}] Finished. Waiting 5 minutes...\n`);
}

// Run immediately
runScraper();

// Then every 5 minutes (300,000 ms)
setInterval(runScraper, 5 * 60 * 1000);
