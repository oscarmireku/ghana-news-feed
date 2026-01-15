import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllArticles, getArticleCount } from '../../lib/db';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Get limit from query
    const { limit: limitParam, content: contentParam } = req.query;
    // Default to 50 (was 1000) to save massive bandwidth for Android app
    const limit = limitParam ? parseInt(limitParam as string) : 50;

    // Default to true for backward compatibility with Android app
    const includeContent = contentParam !== 'false';

    try {
        const [allStories, total] = await Promise.all([
            getAllArticles(limit, includeContent),
            getArticleCount()
        ]);

        // Filter out GhanaWeb articles (REMOVED: User requested to show them again)
        const stories = allStories;

        // Dynamic caching strategy based on time of day (GMT)
        // 10 PM to 5 AM (Overnight): Cache for 1 hour (3600s)
        // 5 AM to 10 PM (Daytime): Cache for 20 minutes (1200s)
        const currentHour = new Date().getUTCHours();
        const isOffPeak = currentHour >= 22 || currentHour < 5;
        const cacheTime = isOffPeak ? 3600 : 1200;

        res.setHeader('Cache-Control', `s-maxage=${cacheTime}, stale-while-revalidate=60`);

        const responseData = {
            stories,
            count: stories.length,
            total_in_database: total,
            new_articles_added: 0
        };

        // Gzip compression for Fast Origin Transfer optimization
        try {
            const jsonBuffer = Buffer.from(JSON.stringify(responseData));
            const compressed = await gzip(jsonBuffer);

            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Type', 'application/json');
            res.status(200).send(compressed);
        } catch (compressionError) {
            console.error('Compression failed, sending uncompressed:', compressionError);
            res.status(200).json(responseData);
        }
    } catch (e) {
        console.error('Error fetching news:', e);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
}
