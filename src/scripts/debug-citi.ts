
import { scrapeCitiNewsRoom } from './scrape-standalone';

async function debugCiti() {
    console.log("Running updated CitiNewsRoom scraper...");

    try {
        const stories = await scrapeCitiNewsRoom();

        console.log(`\nFetched ${stories.length} stories.\n`);

        stories.slice(0, 10).forEach((story, i) => {
            console.log(`[${i}] ${story.title}`);
            console.log(`    Link: ${story.link}`);
            console.log(`    Date: ${story.time} (${story.timestamp})`);
            console.log(`    Image: ${story.image ? 'Yes' : 'No'}`);

            if (story.time === 'Recent') {
                console.log("    -> WARNING: Date parsing failed or fell back to Recent");
            }
        });

    } catch (e) {
        console.error("Error running scraper:", e);
    }
}

debugCiti();
