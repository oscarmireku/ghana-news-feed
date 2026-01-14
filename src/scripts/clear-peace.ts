import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function clearPeaceFM() {
    console.log("Clearing PeaceFM articles...");
    await db.execute("DELETE FROM articles WHERE source = 'PeaceFM'");
    console.log("Done.");
}

clearPeaceFM();
