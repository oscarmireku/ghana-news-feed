
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllArticles, getArticleCount } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Get limit from query
    const { limit: limitParam } = req.query;
    const limit = limitParam ? parseInt(limitParam as string) : 500;

    try {
        const [stories, total] = await Promise.all([
            getAllArticles(limit),
            getArticleCount()
        ]);

        // Cache for 10 minutes (600s) as requested
        res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');

        res.status(200).json({
            stories,
            count: stories.length,
            total_in_database: total,
            new_articles_added: 0
        });
    } catch (e) {
        console.error('Error fetching news:', e);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
}
