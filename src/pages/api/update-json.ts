import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Fetch latest news from database (excluding GhanaWeb)
        const result = await db.execute({
            sql: "SELECT * FROM articles WHERE source != 'GhanaWeb' ORDER BY timestamp DESC LIMIT 100",
            args: []
        });

        const stories = result.rows
            // .filter(row => row.source !== 'GhanaWeb')  // Already filtered in SQL
            .map(row => ({
                id: row.id,
                source: row.source,
                title: row.title,
                link: row.link,
                image: row.image,
                time: row.time,
                section: row.section,
                content: row.content
            }));

        const data = {
            generated_at: new Date().toISOString(),
            count: stories.length,
            total_in_database: stories.length,
            new_articles_added: 0,
            stories
        };

        // Write to public/news-feed.json
        const filePath = path.join(process.cwd(), 'public', 'news-feed.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

        res.status(200).json({ success: true, message: 'news-feed.json updated', count: stories.length });
    } catch (error: any) {
        console.error('Error updating news-feed.json:', error);
        res.status(500).json({ error: error.message });
    }
}
