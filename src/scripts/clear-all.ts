import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function clearAllArticles() {
    console.log("Clearing ALL articles from Turso database...");

    const countResult = await db.execute("SELECT COUNT(*) as count FROM articles");
    const count = countResult.rows[0].count;
    console.log(`Found ${count} total articles to delete.`);

    if (count > 0) {
        await db.execute("DELETE FROM articles");
        console.log("✅ All articles deleted successfully.");
        console.log("Database is now empty and ready for fresh scraping.");
    } else {
        console.log("Database is already empty.");
    }
}

clearAllArticles();
