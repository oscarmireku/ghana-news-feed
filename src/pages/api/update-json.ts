import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@libsql/client';

import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // [TESTING ONLY] Force scraping if requested
        if (req.query.force === 'true') {
            console.log('Forcing scrape via API... (DISABLED on Vercel to prevent timeouts/errors)');
            console.log('Please rely on scheduled GitHub Actions.');
            /*
            try {
                const projectRoot = process.cwd();
                const scriptPath = path.join(projectRoot, 'src', 'scripts', 'scrape-standalone.ts');
                await execPromise(`npx tsx "${scriptPath}"`);
                console.log('Scrape completed successfully.');
            } catch (scrapeError: any) {
                console.error('Forced scrape failed:', scrapeError.message);
            }
            */
        }

        // Fetch latest news from database (Including GhanaWeb again)
        const result = await db.execute({
            sql: "SELECT * FROM articles ORDER BY timestamp DESC LIMIT 100",
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

        // file writing removed for Vercel compatibility

        res.status(200).json({ success: true, message: 'Database query executed (File Write & Scrape Disabled)', count: stories.length });
    } catch (error: any) {
        console.error('Error updating news-feed.json:', error);
        res.status(500).json({ error: error.message });
    }
}
