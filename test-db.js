
const { createClient } = require('@libsql/client');

async function test() {
    console.log('Testing LibSQL connection...');
    try {
        const db = createClient({
            url: 'file:news.db',
        });

        console.log('Client created. Executing query...');
        await db.execute('SELECT 1');
        console.log('SELECT 1 success.');

        // Init DB check
        await db.execute(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT
    )
    `);
        console.log('Table check success.');

        const rs = await db.execute('SELECT COUNT(*) as count FROM articles');
        console.log('Count:', rs.rows[0].count);

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
