import { db } from '../lib/db';

async function showGhanaWebFeeds() {
    try {
        const rs = await db.execute({
            sql: `
                SELECT title, time, image, link 
                FROM articles 
                WHERE source = 'GhanaWeb' 
                ORDER BY timestamp DESC 
                LIMIT 7
            `,
            args: []
        });

        console.log(JSON.stringify(rs.rows, null, 2));

    } catch (error) {
        console.error('Error fetching GhanaWeb feeds:', error);
    }
}

showGhanaWebFeeds();
