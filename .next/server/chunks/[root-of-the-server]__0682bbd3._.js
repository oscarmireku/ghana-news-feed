module.exports=[70406,(e,t,i)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},8976,e=>e.a(async(t,i)=>{try{let t=await e.y("@libsql/client-32956ad46f502899");e.n(t),i()}catch(e){i(e)}},!0),97457,e=>e.a(async(t,i)=>{try{var s=e.i(8976),c=t([s]);[s]=c.then?(await c)():c;let m=process.env.TURSO_DATABASE_URL||"file:news.db",d=process.env.TURSO_AUTH_TOKEN,u=(0,s.createClient)({url:m,authToken:d});async function r(e){if(0===e.length)return 0;let t=0;for(let i of e)try{await u.execute({sql:`
          INSERT INTO articles (id, source, title, link, image, time, section, timestamp, created_at, content)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(link) DO UPDATE SET
            time = excluded.time,
            timestamp = excluded.timestamp,
            image = excluded.image,
            title = excluded.title,
            content = CASE WHEN excluded.content IS NOT NULL THEN excluded.content ELSE articles.content END
        `,args:[i.id,i.source,i.title,i.link,i.image,i.time,i.section,i.timestamp,Date.now(),i.content||null]}),t++}catch(e){"SQLITE_CONSTRAINT"===e.code?console.warn(`[DB] Skipped duplicate/conflict for ${i.title} (${i.id}):`,e.message):console.error(`[DB] Error inserting ${i.title}:`,e)}return t}async function a(e=500,t=!1){return(await u.execute({sql:`
      SELECT id, source, title, link, image, time, section, timestamp${t?", content":""}
      FROM articles
      ORDER BY timestamp DESC
      LIMIT ?
    `,args:[e]})).rows}async function n(e,t=500,i=!1){return(await u.execute({sql:`
      SELECT id, source, title, link, image, time, section, timestamp${i?", content":""}
      FROM articles
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT ?
    `,args:[e,t]})).rows}async function l(){let e=await u.execute("SELECT COUNT(*) as count FROM articles");return Number(e.rows[0].count)}async function o(){let e=await u.execute("SELECT link FROM articles"),t=new Set;for(let i of e.rows)"string"==typeof i.link&&t.add(i.link);return t}async function E(e){return(await u.execute({sql:`
      DELETE FROM articles 
      WHERE id NOT IN (
        SELECT id FROM articles 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `,args:[e]})).rowsAffected}async function T(){let e=["Home - News","Home - Business","Home - Sports","Home-Business","Business archive","News Archive","Sports Archive","Photo Archives","Archive","Category:","Section:","More News","More Stories","View All","Latest News","Top Stories","Click here","Read more","TWI News","News Videos","GhanaWeb TV","| TV","Year In Review","Players Abroad","National Team(s)","Stock Exchange","Exchange Rate","(GSE)"],t=0;try{let i=await u.execute(`
      DELETE FROM articles 
      WHERE image LIKE '%.svg%'
         OR image LIKE '%.svg?%'
    `);if(t+=i.rowsAffected,e.length>0){let i=e.map(()=>"title LIKE ?").join(" OR "),s=e.map(e=>`%${e}%`),c=await u.execute({sql:`DELETE FROM articles WHERE ${i}`,args:s});t+=c.rowsAffected}}catch(e){console.error("Error deleting invalid articles:",e)}return t}(async function(){await u.execute(`
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
  `)})().catch(console.error),e.s(["db",0,u,"deleteInvalidArticles",()=>T,"deleteOldArticles",()=>E,"getAllArticles",()=>a,"getAllLinks",()=>o,"getArticleCount",()=>l,"getArticlesSince",()=>n,"insertArticles",()=>r]),i()}catch(e){i(e)}},!1)];

//# sourceMappingURL=%5Broot-of-the-server%5D__0682bbd3._.js.map