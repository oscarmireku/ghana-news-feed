module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/child_process [external] (child_process, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("child_process", () => require("child_process"));

module.exports = mod;
}),
"[externals]/util [external] (util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("util", () => require("util"));

module.exports = mod;
}),
"[project]/news/src/pages/api/update-json.ts [api] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "default",
    ()=>handler
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$libsql$2f$client__$5b$external$5d$__$2840$libsql$2f$client$2c$__esm_import$2c$__$5b$project$5d2f$news$2f$node_modules$2f40$libsql$2f$client$29$__ = __turbopack_context__.i("[externals]/@libsql/client [external] (@libsql/client, esm_import, [project]/news/node_modules/@libsql/client)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$child_process__$5b$external$5d$__$28$child_process$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/child_process [external] (child_process, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$util__$5b$external$5d$__$28$util$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/util [external] (util, cjs)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f40$libsql$2f$client__$5b$external$5d$__$2840$libsql$2f$client$2c$__esm_import$2c$__$5b$project$5d2f$news$2f$node_modules$2f40$libsql$2f$client$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f40$libsql$2f$client__$5b$external$5d$__$2840$libsql$2f$client$2c$__esm_import$2c$__$5b$project$5d2f$news$2f$node_modules$2f40$libsql$2f$client$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
const execPromise = __TURBOPACK__imported__module__$5b$externals$5d2f$util__$5b$external$5d$__$28$util$2c$__cjs$29$__["default"].promisify(__TURBOPACK__imported__module__$5b$externals$5d2f$child_process__$5b$external$5d$__$28$child_process$2c$__cjs$29$__["exec"]);
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = (0, __TURBOPACK__imported__module__$5b$externals$5d2f40$libsql$2f$client__$5b$external$5d$__$2840$libsql$2f$client$2c$__esm_import$2c$__$5b$project$5d2f$news$2f$node_modules$2f40$libsql$2f$client$29$__["createClient"])({
    url,
    authToken
});
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed'
        });
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
            */ }
        // Fetch latest news from database (Including GhanaWeb again)
        const result = await db.execute({
            sql: "SELECT * FROM articles ORDER BY timestamp DESC LIMIT 100",
            args: []
        });
        const stories = result.rows// .filter(row => row.source !== 'GhanaWeb')  // Already filtered in SQL
        .map((row)=>({
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
        res.status(200).json({
            success: true,
            message: 'Database query executed (File Write & Scrape Disabled)',
            count: stories.length
        });
    } catch (error) {
        console.error('Error updating news-feed.json:', error);
        res.status(500).json({
            error: error.message
        });
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__74c64607._.js.map