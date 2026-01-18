import 'dotenv/config';
import { db } from '../lib/db';

async function listTitles() {
    try {
        const rs = await db.execute(`
            SELECT title, source, time
            FROM articles 
            ORDER BY timestamp DESC
            LIMIT 15
        `);

        console.log(`\nFound ${rs.rows.length} articles:\n`);

        rs.rows.forEach((row: any, i) => {
            console.log(`${i + 1}. [${row.source}] ${row.title} (${row.time})`);
        });

    } catch (e) {
        console.error(e);
    }
}

listTitles();
