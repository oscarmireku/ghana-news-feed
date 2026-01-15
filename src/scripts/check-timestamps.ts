import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function checkTimestamps() {
    console.log("Checking latest timestamps from 3News and Ameyaw Debrah...\n");

    // Get latest from 3News
    const news3 = await db.execute({
        sql: "SELECT source, title, time, timestamp FROM articles WHERE source = '3News' ORDER BY timestamp DESC LIMIT 3",
        args: []
    });

    console.log("=== 3News (Latest 3) ===");
    for (const row of news3.rows) {
        const date = new Date(Number(row.timestamp));
        console.log(`Title: ${String(row.title).substring(0, 60)}...`);
        console.log(`Time field: ${row.time}`);
        console.log(`Timestamp: ${row.timestamp} (${date.toISOString()})`);
        console.log(`---`);
    }

    // Get latest from Ameyaw Debrah
    const ameyaw = await db.execute({
        sql: "SELECT source, title, time, timestamp FROM articles WHERE source = 'Ameyaw Debrah' ORDER BY timestamp DESC LIMIT 3",
        args: []
    });

    console.log("\n=== Ameyaw Debrah (Latest 3) ===");
    for (const row of ameyaw.rows) {
        const date = new Date(Number(row.timestamp));
        console.log(`Title: ${String(row.title).substring(0, 60)}...`);
        console.log(`Time field: ${row.time}`);
        console.log(`Timestamp: ${row.timestamp} (${date.toISOString()})`);
        console.log(`---`);
    }

    // Get overall latest
    console.log("\n=== Overall Latest 5 ===");
    const latest = await db.execute({
        sql: "SELECT source, title, timestamp FROM articles ORDER BY timestamp DESC LIMIT 5",
        args: []
    });

    for (const row of latest.rows) {
        const date = new Date(Number(row.timestamp));
        console.log(`[${row.source}] ${date.toISOString()} - ${String(row.title).substring(0, 50)}...`);
    }
}

checkTimestamps();
