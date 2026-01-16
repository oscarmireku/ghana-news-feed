import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL || 'file:news.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url,
  authToken,
});

// Initialize database (Async wrapper needed or call this explicitly if needed, 
// using top-level await if environment supports it, but simpler to invoke lazily or just ensure it exists.)
// For simplicity in Next.js Serverless, we can attempt to init on load or just cache the promise.
// Actually, pure SQL CREATE TABLE IF NOT EXISTS is cheap.

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT UNIQUE NOT NULL,
      image TEXT,
      time TEXT NOT NULL,
      section TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      content TEXT
    )
  `);
}

// We can just run this. in a serverless env it might run multiple times but it's safe.
// Ideally we'd await this before other ops.
initDb().catch(console.error);


export interface Article {
  id: string;
  source: string;
  title: string;
  link: string;
  image: string | null;
  time: string;
  section: string;
  timestamp: number;
  created_at?: number;
  content?: string;
}

export async function insertArticles(articles: Article[]): Promise<number> {
  if (articles.length === 0) return 0;

  let count = 0;

  // We process individually to ensure one bad egg (duplicate ID) doesn't spoil the bunch
  for (const article of articles) {
    try {
      await db.execute({
        sql: `
          INSERT INTO articles (id, source, title, link, image, time, section, timestamp, created_at, content)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(link) DO UPDATE SET
            time = excluded.time,
            timestamp = excluded.timestamp,
            image = excluded.image,
            title = excluded.title,
            content = CASE WHEN excluded.content IS NOT NULL THEN excluded.content ELSE articles.content END
        `,
        args: [
          article.id,
          article.source,
          article.title,
          article.link,
          article.image,
          article.time,
          article.section,
          article.timestamp,
          Date.now(),
          article.content || null
        ]
      });
      count++;
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        console.warn(`[DB] Skipped duplicate/conflict for ${article.title} (${article.id}):`, err.message);
      } else {
        console.error(`[DB] Error inserting ${article.title}:`, err);
      }
    }
  }

  return count;
}

export async function getAllArticles(limit: number = 500, includeContent: boolean = false): Promise<Article[]> {
  const rs = await db.execute({
    sql: `
      SELECT id, source, title, link, image, time, section, timestamp${includeContent ? ', content' : ''}
      FROM articles
      WHERE image IS NOT NULL AND image != ''
      ORDER BY timestamp DESC
      LIMIT ?
    `,
    args: [limit]
  });

  // rs.rows is correct
  return rs.rows as unknown as Article[];
}

export async function getArticlesSince(
  sinceTimestamp: number,
  limit: number = 500,
  includeContent: boolean = false
): Promise<Article[]> {
  const rs = await db.execute({
    sql: `
      SELECT id, source, title, link, image, time, section, timestamp${includeContent ? ', content' : ''}
      FROM articles
      WHERE image IS NOT NULL 
        AND image != ''
        AND timestamp > ?
      ORDER BY timestamp DESC
      LIMIT ?
    `,
    args: [sinceTimestamp, limit]
  });

  return rs.rows as unknown as Article[];
}

export async function getArticleCount(): Promise<number> {
  const rs = await db.execute('SELECT COUNT(*) as count FROM articles');
  return Number(rs.rows[0].count);
}

export async function getAllLinks(): Promise<Set<string>> {
  const rs = await db.execute('SELECT link FROM articles');
  const links = new Set<string>();
  for (const row of rs.rows) {
    if (typeof row.link === 'string') {
      links.add(row.link);
    }
  }
  return links;
}

export async function getLatestTimestampsBySource(): Promise<Map<string, number>> {
  const rs = await db.execute('SELECT source, MAX(timestamp) as max_time FROM articles GROUP BY source');
  const map = new Map<string, number>();
  for (const row of rs.rows) {
    if (typeof row.source === 'string' && typeof row.max_time === 'number') {
      map.set(row.source, row.max_time);
    }
  }
  return map;
}


export async function deleteOldArticles(limit: number): Promise<number> {
  // SQLite doesn't support DELETE ... LIMIT directly in all versions, 
  // but simpler: DELETE WHERE id NOT IN (SELECT id ... LIMIT ?)
  const rs = await db.execute({
    sql: `
      DELETE FROM articles 
      WHERE id NOT IN (
        SELECT id FROM articles 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `,
    args: [limit]
  });
  return rs.rowsAffected;
}

export async function deleteInvalidArticles(): Promise<number> {
  const unwantedTitlePatterns = [
    'Home - News', 'Home - Business', 'Home - Sports', 'Home-Business',
    'Business archive', 'News Archive', 'Sports Archive', 'Photo Archives',
    'Archive', 'Category:', 'Section:', 'More News', 'More Stories',
    'View All', 'Latest News', 'Top Stories'
  ];

  let count = 0;
  try {
    // REMOVED: Deletion of articles without images
    // This was causing valid articles from feeds like ZionFelix, YFM Ghana to be deleted
    // Only delete SVG images which are usually logos/icons, not article images
    const badImageResult = await db.execute(`
      DELETE FROM articles 
      WHERE image LIKE '%.svg%'
         OR image LIKE '%.svg?%'
    `);
    count += badImageResult.rowsAffected;

    // Construct OR conditions for titles
    if (unwantedTitlePatterns.length > 0) {
      const conditions = unwantedTitlePatterns.map(() => `title LIKE ?`).join(' OR ');
      const args = unwantedTitlePatterns.map(p => `%${p}%`);

      const badTitleResult = await db.execute({
        sql: `DELETE FROM articles WHERE ${conditions}`,
        args: args
      });
      count += badTitleResult.rowsAffected;
    }

  } catch (err) {
    console.error('Error deleting invalid articles:', err);
  }
  return count;
}
