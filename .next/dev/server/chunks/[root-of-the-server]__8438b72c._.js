module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/news/src/lib/db.ts [api] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "db",
    ()=>db,
    "deleteInvalidArticles",
    ()=>deleteInvalidArticles,
    "deleteOldArticles",
    ()=>deleteOldArticles,
    "getAllArticles",
    ()=>getAllArticles,
    "getAllLinks",
    ()=>getAllLinks,
    "getArticleCount",
    ()=>getArticleCount,
    "insertArticles",
    ()=>insertArticles
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$libsql$2f$client__$5b$external$5d$__$2840$libsql$2f$client$2c$__esm_import$2c$__$5b$project$5d2f$news$2f$node_modules$2f40$libsql$2f$client$29$__ = __turbopack_context__.i("[externals]/@libsql/client [external] (@libsql/client, esm_import, [project]/news/node_modules/@libsql/client)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f40$libsql$2f$client__$5b$external$5d$__$2840$libsql$2f$client$2c$__esm_import$2c$__$5b$project$5d2f$news$2f$node_modules$2f40$libsql$2f$client$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f40$libsql$2f$client__$5b$external$5d$__$2840$libsql$2f$client$2c$__esm_import$2c$__$5b$project$5d2f$news$2f$node_modules$2f40$libsql$2f$client$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
const url = process.env.TURSO_DATABASE_URL || 'file:news.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = (0, __TURBOPACK__imported__module__$5b$externals$5d2f40$libsql$2f$client__$5b$external$5d$__$2840$libsql$2f$client$2c$__esm_import$2c$__$5b$project$5d2f$news$2f$node_modules$2f40$libsql$2f$client$29$__["createClient"])({
    url,
    authToken
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
async function insertArticles(articles) {
    if (articles.length === 0) return 0;
    let count = 0;
    // LibSQL client doesn't support massive bulk inserts in one statement easily without constructing the string manually
    // or using transactions nicely. 
    // We can use a transaction.
    const tx = await db.transaction('write');
    try {
        for (const article of articles){
            await tx.execute({
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
        }
        await tx.commit();
        return count;
    } catch (err) {
        console.error('Error inserting articles:', err);
        // Don't rollback explicitly, LibSQL client handles it or it just fails.
        return 0;
    }
}
async function getAllArticles(limit = 500) {
    const rs = await db.execute({
        sql: `
      SELECT id, source, title, link, image, time, section, timestamp, content
      FROM articles
      WHERE image IS NOT NULL AND image != ''
      ORDER BY timestamp DESC
      LIMIT ?
    `,
        args: [
            limit
        ]
    });
    // rs.rows is correct
    return rs.rows;
}
async function getArticleCount() {
    const rs = await db.execute('SELECT COUNT(*) as count FROM articles');
    return Number(rs.rows[0].count);
}
async function getAllLinks() {
    const rs = await db.execute('SELECT link FROM articles');
    const links = new Set();
    for (const row of rs.rows){
        if (typeof row.link === 'string') {
            links.add(row.link);
        }
    }
    return links;
}
async function deleteOldArticles(limit) {
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
        args: [
            limit
        ]
    });
    return rs.rowsAffected;
}
async function deleteInvalidArticles() {
    const unwantedTitlePatterns = [
        'Home - News',
        'Home - Business',
        'Home - Sports',
        'Home-Business',
        'Business archive',
        'News Archive',
        'Sports Archive',
        'Photo Archives',
        'Archive',
        'Category:',
        'Section:',
        'More News',
        'More Stories',
        'View All',
        'Latest News',
        'Top Stories'
    ];
    let count = 0;
    try {
        const badImageResult = await db.execute(`
      DELETE FROM articles 
      WHERE image IS NULL 
         OR image = '' 
         OR image LIKE '%.svg%'
         OR image LIKE '%.svg?%'
    `);
        count += badImageResult.rowsAffected;
        // Construct OR conditions for titles
        if (unwantedTitlePatterns.length > 0) {
            const conditions = unwantedTitlePatterns.map(()=>`title LIKE ?`).join(' OR ');
            const args = unwantedTitlePatterns.map((p)=>`%${p}%`);
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
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/news/src/pages/api/news.ts [api] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "default",
    ()=>handler
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$news$2f$src$2f$lib$2f$db$2e$ts__$5b$api$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/news/src/lib/db.ts [api] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$news$2f$src$2f$lib$2f$db$2e$ts__$5b$api$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$news$2f$src$2f$lib$2f$db$2e$ts__$5b$api$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
async function handler(req, res) {
    // Get limit from query
    const { limit: limitParam } = req.query;
    const limit = limitParam ? parseInt(limitParam) : 500;
    try {
        const [allStories, total] = await Promise.all([
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$news$2f$src$2f$lib$2f$db$2e$ts__$5b$api$5d$__$28$ecmascript$29$__["getAllArticles"])(limit),
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$news$2f$src$2f$lib$2f$db$2e$ts__$5b$api$5d$__$28$ecmascript$29$__["getArticleCount"])()
        ]);
        // Filter out GhanaWeb articles (REMOVED: User requested to show them again)
        const stories = allStories;
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
        res.status(500).json({
            error: 'Failed to fetch news'
        });
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__8438b72c._.js.map