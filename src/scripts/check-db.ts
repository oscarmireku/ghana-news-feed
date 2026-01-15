import 'dotenv/config';
import { getAllArticles, getArticleCount, db } from '../lib/db';

async function main() {
    try {
        const count = await getArticleCount();
        console.log(`Total articles in DB: ${count}`);

        const articles = await getAllArticles(1, true);
        if (articles.length > 0) {
            const latest = articles[0];
            console.log('Latest Article:');
            console.log(`  Title: ${latest.title}`);
            console.log(`  Source: ${latest.source}`);
            console.log(`  Time (Display): ${latest.time}`);
            console.log(`  Timestamp: ${latest.timestamp}`);
            console.log(`  Date: ${new Date(Number(latest.timestamp)).toString()}`);
            console.log(`  Content Length: ${latest.content ? latest.content.length : 'NULL'}`);
        } else {
            console.log('No articles found in DB.');
        }

        const gwArticles = await db.execute({
            sql: 'SELECT * FROM articles WHERE source = ? ORDER BY timestamp DESC LIMIT 1',
            args: ['GhanaWeb']
        });

        if (gwArticles.rows.length > 0) {
            const latest = gwArticles.rows[0];
            console.log('\nLatest GhanaWeb Article:');
            console.log(`  Title: ${latest.title}`);
            console.log(`  Link: ${latest.link}`);
            console.log(`  Time (Display): ${latest.time}`);
            console.log(`  Timestamp: ${latest.timestamp}`);
            console.log(`  Date: ${new Date(Number(latest.timestamp)).toString()}`);
            console.log(`  Content Length: ${latest.content ? latest.content.length : 'NULL'}`);
        } else {
            console.log('\nNo GhanaWeb articles found.');
        }
    } catch (error) {
        console.error('Error checking DB:', error);
    }
}

main();
