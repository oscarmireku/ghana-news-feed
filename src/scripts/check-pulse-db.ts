import 'dotenv/config';
import { db } from '../lib/db';

async function checkPulseArticles() {
    const res = await db.execute('SELECT link, title, content FROM articles WHERE source = "pulse.com.gh" LIMIT 3');
    console.log('Pulse.com.gh articles:\n');
    for (const row of res.rows) {
        console.log(`Title: ${row.title}`);
        console.log(`Link: ${row.link}`);
        console.log(`Content length: ${row.content ? (row.content as string).length : 0}`);
        if (row.content) {
            console.log(`Content preview: ${(row.content as string).substring(0, 200)}...\n`);
        } else {
            console.log('No content!\n');
        }
    }
}

checkPulseArticles();
