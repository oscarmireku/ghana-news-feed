import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

console.log("Testing API response...\n");

const db = createClient({ url, authToken });

async function testAPI() {
    // Simulate what the API does
    const result = await db.execute({
        sql: 'SELECT * FROM articles ORDER BY timestamp DESC LIMIT 100',
        args: []
    });

    console.log(`Total rows fetched: ${result.rows.length}`);

    const allStories = result.rows.map(row => ({
        id: row.id,
        source: row.source,
        title: row.title
    }));

    console.log(`\nBefore filter: ${allStories.length} articles`);
    console.log("Sources:", [...new Set(allStories.map(s => s.source))].join(', '));

    const filtered = allStories.filter(story => story.source !== 'GhanaWeb');

    console.log(`\nAfter filtering GhanaWeb: ${filtered.length} articles`);
    console.log("\nFirst 5 articles:");
    filtered.slice(0, 5).forEach((s, i) => {
        console.log(`${i + 1}. [${s.source}] ${s.title}`);
    });
}

testAPI();
