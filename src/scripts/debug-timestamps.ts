import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function debugTimestamps() {
    console.log("=== Debugging Timestamp Conversion ===\n");

    // Test the parsePublicationDate function logic
    const testDates = [
        "Wed, 14 Jan 2026 18:23:23 GMT",  // 3News format with GMT
        "Jan 14, 2026 2:21 PM",            // MyJoyOnline format without timezone
    ];

    console.log("Testing date parsing:");
    for (const dateStr of testDates) {
        let cleaned = dateStr.trim();
        const hasTimezone = /GMT|UTC|Z|[+-]\d{2}:?\d{2}/.test(cleaned);

        if (!hasTimezone) {
            cleaned += ' GMT';
        }

        const d = new Date(cleaned);
        console.log(`\nInput: ${dateStr}`);
        console.log(`Has timezone: ${hasTimezone}`);
        console.log(`Adjusted: ${cleaned}`);
        console.log(`Parsed to: ${d.toISOString()}`);
        console.log(`Timestamp: ${d.getTime()}`);
    }

    // Check what's actually in the database
    console.log("\n\n=== Latest 3News Article in DB ===");
    const news3 = await db.execute({
        sql: "SELECT title, time, timestamp FROM articles WHERE source = '3News' ORDER BY timestamp DESC LIMIT 1",
        args: []
    });

    if (news3.rows.length > 0) {
        const row = news3.rows[0];
        const date = new Date(Number(row.timestamp));
        console.log(`Title: ${row.title}`);
        console.log(`Time field (display): ${row.time}`);
        console.log(`Timestamp (raw): ${row.timestamp}`);
        console.log(`Timestamp (ISO): ${date.toISOString()}`);
        console.log(`Timestamp (GMT string): ${date.toUTCString()}`);
    }
}

debugTimestamps();
