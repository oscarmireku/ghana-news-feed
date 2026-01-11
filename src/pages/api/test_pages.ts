
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    res.status(200).json({ status: 'ok_from_pages_router', time: new Date().toISOString() });
}
