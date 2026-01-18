import 'dotenv/config';
import { db } from '../lib/db';

async function main() {
    try {
        const rs = await db.execute(`
            SELECT source, COUNT(*) as count 
            FROM articles 
            GROUP BY source 
            ORDER BY count DESC
        `);

        console.log('\n--- Article Distribution by Source ---');
        let total = 0;
        rs.rows.forEach(row => {
            console.log(`${String(row.source).padEnd(20)}: ${row.count}`);
            total += Number(row.count);
        });
        console.log('--------------------------------------');
        console.log(`${String("TOTAL").padEnd(20)}: ${total}`);

    } catch (e) {
        console.error(e);
    }
}

main();
