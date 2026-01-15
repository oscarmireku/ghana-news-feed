import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function clearMyJoyOnline() {
    console.log("Clearing MyJoyOnline articles to force re-scrape with correct GMT timestamps...");
    const countResult = await db.execute("SELECT COUNT(*) as count FROM articles WHERE source = 'MyJoyOnline'");
    const count = countResult.rows[0].count;
    console.log(`Found ${count} articles to delete.`);

    if (count > 0) {
        await db.execute("DELETE FROM articles WHERE source = 'MyJoyOnline'");
        console.log("Deleted successfully. Run scraper to re-fetch with correct timestamps.");
    } else {
        console.log("Nothing to delete.");
    }
}

clearMyJoyOnline();
