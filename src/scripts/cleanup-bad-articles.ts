import 'dotenv/config';
import { db, deleteInvalidArticles } from '../lib/db';

async function main() {
    try {
        console.log('Cleaning up articles with NULL content...');
        const res = await db.execute("DELETE FROM articles WHERE content IS NULL OR content = ''");
        console.log(`Deleted ${res.rowsAffected} articles with missing content.`);

        console.log('Cleaning up invalid titles...');
        const invalidCount = await deleteInvalidArticles();
        console.log(`Deleted ${invalidCount} articles with invalid titles.`);

        // Also delete GhanaWeb articles with 'Recent' time (implied by content check usually, but let's be safe)
        // actually content check covers it.

    } catch (e) {
        console.error('Error cleaning DB:', e);
    }
}

main();
