module.exports=[70406,(e,t,a)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},8976,e=>e.a(async(t,a)=>{try{let t=await e.y("@libsql/client-32956ad46f502899");e.n(t),a()}catch(e){a(e)}},!0),97457,e=>e.a(async(t,a)=>{try{var i=e.i(8976),r=t([i]);[i]=r.then?(await r)():r;let E=process.env.TURSO_DATABASE_URL||"file:news.db",p=process.env.TURSO_AUTH_TOKEN,m=(0,i.createClient)({url:E,authToken:p});async function s(e){if(0===e.length)return 0;let t=0;for(let a of e)try{await m.execute({sql:`
          INSERT INTO articles (id, source, title, link, image, time, section, timestamp, created_at, content)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(link) DO UPDATE SET
            time = excluded.time,
            timestamp = excluded.timestamp,
            image = excluded.image,
            title = excluded.title,
            content = CASE WHEN excluded.content IS NOT NULL THEN excluded.content ELSE articles.content END
        `,args:[a.id,a.source,a.title,a.link,a.image,a.time,a.section,a.timestamp,Date.now(),a.content||null]}),t++}catch(e){"SQLITE_CONSTRAINT"===e.code?console.warn(`[DB] Skipped duplicate/conflict for ${a.title} (${a.id}):`,e.message):console.error(`[DB] Error inserting ${a.title}:`,e)}return t}async function n(e=500,t=!1){return(await m.execute({sql:`
      SELECT id, source, title, link, image, time, section, timestamp${t?", content":""}
      FROM articles
      ORDER BY timestamp DESC
      LIMIT ?
    `,args:[e]})).rows}async function c(e,t=500,a=!1){return(await m.execute({sql:`
      SELECT id, source, title, link, image, time, section, timestamp${a?", content":""}
      FROM articles
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT ?
    `,args:[e,t]})).rows}async function l(){let e=await m.execute("SELECT COUNT(*) as count FROM articles");return Number(e.rows[0].count)}async function o(){let e=await m.execute("SELECT link FROM articles"),t=new Set;for(let a of e.rows)"string"==typeof a.link&&t.add(a.link);return t}async function d(e){return(await m.execute({sql:`
      DELETE FROM articles 
      WHERE id NOT IN (
        SELECT id FROM articles 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `,args:[e]})).rowsAffected}async function u(){let e=["Home - News","Home - Business","Home - Sports","Home-Business","Business archive","News Archive","Sports Archive","Photo Archives","Archive","Category:","Section:","More News","More Stories","View All","Latest News","Top Stories","Click here","Read more","TWI News","News Videos","GhanaWeb TV","| TV","Year In Review","Players Abroad","National Team(s)","Stock Exchange","Exchange Rate","(GSE)"],t=0;try{let a=await m.execute(`
      DELETE FROM articles 
      WHERE image LIKE '%.svg%'
         OR image LIKE '%.svg?%'
    `);if(t+=a.rowsAffected,e.length>0){let a=e.map(()=>"title LIKE ?").join(" OR "),i=e.map(e=>`%${e}%`),r=await m.execute({sql:`DELETE FROM articles WHERE ${a}`,args:i});t+=r.rowsAffected}}catch(e){console.error("Error deleting invalid articles:",e)}return t}(async function(){await m.execute(`
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
  `)})().catch(console.error),e.s(["db",0,m,"deleteInvalidArticles",()=>u,"deleteOldArticles",()=>d,"getAllArticles",()=>n,"getAllLinks",()=>o,"getArticleCount",()=>l,"getArticlesSince",()=>c,"insertArticles",()=>s]),a()}catch(e){a(e)}},!1),28681,e=>e.a(async(t,a)=>{try{var i=e.i(97457),r=t([i]);async function s(e,t){if(e.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return t.status(401).json({success:!1,message:"Unauthorized"});try{await i.db.execute("DELETE FROM articles"),t.status(200).json({success:!0,message:"Database cleared successfully"})}catch(e){console.error("Error clearing database:",e),t.status(500).json({error:"Failed to clear database"})}}[i]=r.then?(await r)():r,e.s(["default",()=>s]),a()}catch(e){a(e)}},!1),77395,e=>e.a(async(t,a)=>{try{var i=e.i(4589),r=e.i(69442),s=e.i(16967),n=e.i(79109),c=e.i(28681),l=e.i(71295),o=e.i(54580),d=e.i(1551),u=t([c]);[c]=u.then?(await u)():u;let p=(0,n.hoist)(c,"default"),m=(0,n.hoist)(c,"config"),T=new s.PagesAPIRouteModule({definition:{kind:r.RouteKind.PAGES_API,page:"/api/clear-db",pathname:"/api/clear-db",bundlePath:"",filename:""},userland:c,distDir:".next",relativeProjectDir:""});async function E(e,t,a){T.isDev&&(0,d.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let r="/api/clear-db";r=r.replace(/\/index$/,"")||"/";let s=await T.prepare(e,t,{srcPage:r});if(!s){t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve());return}let{query:n,params:c,prerenderManifest:u,routerServerContext:E}=s;try{let a=e.method||"GET",i=(0,l.getTracer)(),s=i.getActiveScopeSpan(),d=T.instrumentationOnRequestError.bind(T),p=async s=>T.render(e,t,{query:{...n,...c},params:c,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:u.preview,propagateError:!1,dev:T.isDev,page:"/api/clear-db",internalRevalidate:null==E?void 0:E.revalidate,onError:(...t)=>d(e,...t)}).finally(()=>{if(!s)return;s.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let e=i.getRootSpanAttributes();if(!e)return;if(e.get("next.span_type")!==o.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${e.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=e.get("next.route");if(n){let e=`${a} ${n}`;s.setAttributes({"next.route":n,"http.route":n,"next.span_name":e}),s.updateName(e)}else s.updateName(`${a} ${r}`)});s?await p(s):await i.withPropagatedContext(e.headers,()=>i.trace(o.BaseServerSpan.handleRequest,{spanName:`${a} ${r}`,kind:l.SpanKind.SERVER,attributes:{"http.method":a,"http.target":e.url}},p))}catch(e){if(T.isDev)throw e;(0,i.sendError)(t,500,"Internal Server Error")}finally{null==a.waitUntil||a.waitUntil.call(a,Promise.resolve())}}e.s(["config",0,m,"default",0,p,"handler",()=>E]),a()}catch(e){a(e)}},!1)];

//# sourceMappingURL=%5Broot-of-the-server%5D__bc8a2e98._.js.map