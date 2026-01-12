import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Security: Require secret key
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
        // Clear all articles
        await db.execute('DELETE FROM articles');

        res.status(200).json({
            success: true,
            message: 'Database cleared successfully'
        });
    } catch (e) {
        console.error('Error clearing database:', e);
        res.status(500).json({ error: 'Failed to clear database' });
    }
}
