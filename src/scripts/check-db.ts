
import { db } from '../lib/db';

async function main() {
    try {
        console.log("Checking DB stats...");

        // Count by source
        const result = await db.execute(`
            SELECT source, COUNT(*) as count, MAX(timestamp) as last_timestamp 
            FROM articles 
            WHERE source IN ('MyJoyOnline', 'Nkonkonsa')
            GROUP BY source
        `);

        console.log("Source Stats:");
        for (const row of result.rows) {
            const date = new Date(Number(row.last_timestamp));
            console.log(`- ${row.source}: ${row.count} articles. Last: ${date.toLocaleString()}`);
        }

        if (result.rows.length === 0) {
            console.log("No articles found for MyJoyOnline or Nkonkonsa.");
        }

        const total = await db.execute('SELECT COUNT(*) as c FROM articles');
        console.log(`Total articles in DB: ${total.rows[0].c}`);

    } catch (e) {
        console.error("DB check failed:", e);
    }
}

main();
