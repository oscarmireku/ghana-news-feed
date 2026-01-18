import 'dotenv/config';
import { db } from '../lib/db';

async function main() {
    try {
        console.log('Deleting incomplete GhanaSoccerNet articles...');

        const result = await db.execute(`
            DELETE FROM articles 
            WHERE source = 'GhanaSoccerNet' 
            AND (content IS NULL OR content = '' OR image IS NULL OR image = '')
        `);

        console.log(`Deleted ${result.rowsAffected} articles.`);

    } catch (e) {
        console.error(e);
    }
}

main();
