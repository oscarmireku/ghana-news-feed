
import 'dotenv/config';
import { db } from '../lib/db';

async function main() {
    try {
        console.log('Verifying GhanaWeb article counts per section...');
        // We only care about recent articles to see if the limit increase is effective
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        const result = await db.execute({
            sql: `
                SELECT section, COUNT(*) as count 
                FROM articles 
                WHERE source = 'GhanaWeb' AND timestamp > ?
                GROUP BY section
            `,
            args: [sevenDaysAgo]
        });

        console.log('Recent GhanaWeb Articles by Section:');
        for (const row of result.rows) {
            console.log(`${row.section}: ${row.count}`);
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

main();
