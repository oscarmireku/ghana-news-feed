import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function clearGhanaWeb() {
    console.log("Clearing GhanaWeb articles to force re-scrape with correct dates...");
    await db.execute("DELETE FROM articles WHERE source = 'GhanaWeb'");
    console.log("Done.");
}

clearGhanaWeb();
