import { db } from '../lib/db';

async function checkGhanaWebStatus() {
    try {
        // 1. Get latest article time
        const latestQuery = await db.execute(`
            SELECT title, time, timestamp, link 
            FROM articles 
            WHERE source = 'GhanaWeb' 
            ORDER BY timestamp DESC 
            LIMIT 1
        `);

        console.log('--- LATEST ARTICLE ---');
        console.log(latestQuery.rows[0]);

        // 2. Count total articles
        const countQuery = await db.execute(`
            SELECT COUNT(*) as count FROM articles WHERE source = 'GhanaWeb'
        `);
        console.log('--- TOTAL COUNT ---');
        console.log(countQuery.rows[0]);

    } catch (error) {
        console.error('Error:', error);
    }
}

checkGhanaWebStatus();
