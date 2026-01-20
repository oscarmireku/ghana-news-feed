
import 'dotenv/config';
import { db } from '../src/lib/db';

async function fixGhanaWeb() {
    console.log('Checking for GhanaWeb stories with missing content...');

    // Debug: check if loading from env
    if (process.env.TURSO_DATABASE_URL) {
        console.log('Using TURSO_DATABASE_URL from env');
    } else {
        console.log('WARNING: TURSO_DATABASE_URL not found in env, using default.');
    }

    try {
        // Find articles from GhanaWeb that have empty or very short content
        const result = await db.execute({
            sql: `
                SELECT id, title, link, length(content) as len 
                FROM articles 
                WHERE source = 'GhanaWeb' 
                AND (content IS NULL OR length(content) < 500)
            `,
            args: []
        });

        const badArticles = result.rows;
        console.log(`Found ${badArticles.length} GhanaWeb articles with missing/short content.`);

        if (badArticles.length > 0) {
            console.log('Deleting these articles to allow re-scraping...');

            // Delete them individually or in a batch
            for (const article of badArticles) {
                console.log(`- Deleting: ${article.title} (Length: ${article.len})`);
                await db.execute({
                    sql: 'DELETE FROM articles WHERE id = ?',
                    args: [article.id]
                });
            }
            console.log('Deletion complete.');
        } else {
            console.log('No defective articles found.');
        }
    } catch (e) {
        console.error('Error fixing GhanaWeb articles:', e);
    }
}

fixGhanaWeb();
