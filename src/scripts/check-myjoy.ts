import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function checkMyJoyOnline() {
    console.log("Checking MyJoyOnline timestamps...\n");

    // Get latest from MyJoyOnline
    const myjoy = await db.execute({
        sql: "SELECT source, title, time, timestamp FROM articles WHERE source = 'MyJoyOnline' ORDER BY timestamp DESC LIMIT 5",
        args: []
    });

    console.log("=== MyJoyOnline (Latest 5) ===");
    for (const row of myjoy.rows) {
        const date = new Date(Number(row.timestamp));
        console.log(`Title: ${row.title}`);
        console.log(`Time field: ${row.time}`);
        console.log(`Timestamp: ${row.timestamp} (${date.toISOString()})`);
        console.log(`---`);
    }

    // Search for Gaza story
    console.log("\n=== Searching for Gaza story ===");
    const gaza = await db.execute({
        sql: "SELECT source, title, time, timestamp FROM articles WHERE title LIKE '%gaza%' OR title LIKE '%Gaza%' ORDER BY timestamp DESC LIMIT 3",
        args: []
    });

    for (const row of gaza.rows) {
        const date = new Date(Number(row.timestamp));
        console.log(`[${row.source}] ${row.title}`);
        console.log(`Time: ${row.time}`);
        console.log(`Timestamp: ${row.timestamp} (${date.toISOString()})`);
        console.log(`---`);
    }

    // Get overall latest 10
    console.log("\n=== Overall Latest 10 ===");
    const latest = await db.execute({
        sql: "SELECT source, title, timestamp FROM articles ORDER BY timestamp DESC LIMIT 10",
        args: []
    });

    for (const row of latest.rows) {
        const date = new Date(Number(row.timestamp));
        console.log(`[${row.source}] ${date.toISOString()} - ${String(row.title).substring(0, 60)}...`);
    }
}

checkMyJoyOnline();
