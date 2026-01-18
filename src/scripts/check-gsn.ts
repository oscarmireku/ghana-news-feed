import 'dotenv/config';
import { db } from '../lib/db';

async function main() {
    try {
        const rs = await db.execute(`
            SELECT id, title, image, content, link, timestamp 
            FROM articles 
            WHERE source = 'GhanaSoccerNet'
            ORDER BY timestamp DESC
        `);

        console.log(`\nFound ${rs.rows.length} GhanaSoccerNet articles.`);
        console.log('---------------------------------------------------');

        let missingContent = 0;
        let missingImage = 0;

        rs.rows.forEach((row: any) => {
            const hasContent = row.content && row.content.trim().length > 0;
            const hasImage = row.image && row.image.trim().length > 0;

            if (!hasContent) missingContent++;
            if (!hasImage) missingImage++;

            const status = (hasContent && hasImage) ? '✅ OK' : '❌ MISSING DATA';

            console.log(`${status} | ${row.title.substring(0, 50)}...`);
            if (!hasContent) console.log(`   - Missing Content`);
            if (!hasImage) console.log(`   - Missing Image`);
        });

        console.log('---------------------------------------------------');
        console.log(`Total: ${rs.rows.length}`);
        console.log(`Missing Content: ${missingContent}`);
        console.log(`Missing Image: ${missingImage}`);

    } catch (e) {
        console.error(e);
    }
}

main();
