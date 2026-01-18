import 'dotenv/config';
import { db } from '../lib/db';

async function verifyScrape() {
    try {
        const countQuery = await db.execute('SELECT COUNT(*) as count FROM articles');
        const count = countQuery.rows[0].count;
        console.log(`\n✅ Total Articles in DB: ${count}`);

        if (count > 0) {
            const sampleQuery = await db.execute(`
                SELECT title, source, time, image 
                FROM articles 
                ORDER BY timestamp DESC 
                LIMIT 5
            `);

            console.log('\n--- Sample Latest Articles (Android App View) ---');
            console.log(JSON.stringify(sampleQuery.rows, null, 2));

            // Check distribution
            const distQuery = await db.execute(`
                SELECT source, COUNT(*) as c 
                FROM articles 
                GROUP BY source 
                ORDER BY c DESC
            `);
            console.log('\n--- Article Distribution by Source ---');
            distQuery.rows.forEach((row: any) => {
                console.log(`${row.source}: ${row.c}`);
            });
        }
    } catch (e) {
        console.error('Error verifying scrape:', e);
    }
}

verifyScrape();
