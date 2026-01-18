module.exports=[70406,(e,t,i)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},24361,(e,t,i)=>{t.exports=e.x("util",()=>require("util"))},8976,e=>e.a(async(t,i)=>{try{let t=await e.y("@libsql/client-32956ad46f502899");e.n(t),i()}catch(e){i(e)}},!0),97457,e=>e.a(async(t,i)=>{try{var a=e.i(8976),r=t([a]);[a]=r.then?(await r)():r;let E=process.env.TURSO_DATABASE_URL||"file:news.db",p=process.env.TURSO_AUTH_TOKEN,m=(0,a.createClient)({url:E,authToken:p});async function n(e){if(0===e.length)return 0;let t=0;for(let i of e)try{await m.execute({sql:`
          INSERT INTO articles (id, source, title, link, image, time, section, timestamp, created_at, content)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(link) DO UPDATE SET
            time = excluded.time,
            timestamp = excluded.timestamp,
            image = excluded.image,
            title = excluded.title,
            content = CASE WHEN excluded.content IS NOT NULL THEN excluded.content ELSE articles.content END
        `,args:[i.id,i.source,i.title,i.link,i.image,i.time,i.section,i.timestamp,Date.now(),i.content||null]}),t++}catch(e){"SQLITE_CONSTRAINT"===e.code?console.warn(`[DB] Skipped duplicate/conflict for ${i.title} (${i.id}):`,e.message):console.error(`[DB] Error inserting ${i.title}:`,e)}return t}async function s(e=500,t=!1){return(await m.execute({sql:`
      SELECT id, source, title, link, image, time, section, timestamp${t?", content":""}
      FROM articles
      ORDER BY timestamp DESC
      LIMIT ?
    `,args:[e]})).rows}async function l(e,t=500,i=!1){return(await m.execute({sql:`
      SELECT id, source, title, link, image, time, section, timestamp${i?", content":""}
      FROM articles
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT ?
    `,args:[e,t]})).rows}async function o(){let e=await m.execute("SELECT COUNT(*) as count FROM articles");return Number(e.rows[0].count)}async function c(){let e=await m.execute("SELECT link FROM articles"),t=new Set;for(let i of e.rows)"string"==typeof i.link&&t.add(i.link);return t}async function d(e){return(await m.execute({sql:`
      DELETE FROM articles 
      WHERE id NOT IN (
        SELECT id FROM articles 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `,args:[e]})).rowsAffected}async function u(){let e=["Home - News","Home - Business","Home - Sports","Home-Business","Business archive","News Archive","Sports Archive","Photo Archives","Archive","Category:","Section:","More News","More Stories","View All","Latest News","Top Stories","Click here","Read more","TWI News","News Videos","GhanaWeb TV","| TV","Year In Review","Players Abroad","National Team(s)","Stock Exchange","Exchange Rate","(GSE)"],t=0;try{let i=await m.execute(`
      DELETE FROM articles 
      WHERE image LIKE '%.svg%'
         OR image LIKE '%.svg?%'
    `);if(t+=i.rowsAffected,e.length>0){let i=e.map(()=>"title LIKE ?").join(" OR "),a=e.map(e=>`%${e}%`),r=await m.execute({sql:`DELETE FROM articles WHERE ${i}`,args:a});t+=r.rowsAffected}}catch(e){console.error("Error deleting invalid articles:",e)}return t}(async function(){await m.execute(`
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
  `)})().catch(console.error),e.s(["db",0,m,"deleteInvalidArticles",()=>u,"deleteOldArticles",()=>d,"getAllArticles",()=>s,"getAllLinks",()=>c,"getArticleCount",()=>o,"getArticlesSince",()=>l,"insertArticles",()=>n]),i()}catch(e){i(e)}},!1),6461,(e,t,i)=>{t.exports=e.x("zlib",()=>require("zlib"))},79800,e=>e.a(async(t,i)=>{try{var a=e.i(97457),r=e.i(6461),n=e.i(24361),s=t([a]);[a]=s.then?(await s)():s;let o=(0,n.promisify)(r.default.gzip);async function l(e,t){let{limit:i,content:r,since:n}=e.query,s=i?parseInt(i):50,l="false"!==r,c=n?parseInt(n):null;try{let e;e=c&&!isNaN(c)?await (0,a.getArticlesSince)(c,s,l):await (0,a.getAllArticles)(s,l);let i=await (0,a.getArticleCount)(),r=new Date().getUTCHours(),n=c?300:r>=22||r<5?3600:330;t.setHeader("Cache-Control",`s-maxage=${n}, stale-while-revalidate=60`);let d={stories:e,count:e.length,total_in_database:i,new_articles_added:0};try{let e=Buffer.from(JSON.stringify(d)),i=await o(e);t.setHeader("Content-Encoding","gzip"),t.setHeader("Content-Type","application/json"),t.status(200).send(i)}catch(e){console.error("Compression failed, sending uncompressed:",e),t.status(200).json(d)}}catch(e){console.error("Error fetching news:",e),t.status(500).json({error:"Failed to fetch news"})}}e.s(["default",()=>l]),i()}catch(e){i(e)}},!1),59201,e=>e.a(async(t,i)=>{try{var a=e.i(4589),r=e.i(69442),n=e.i(16967),s=e.i(79109),l=e.i(79800),o=e.i(71295),c=e.i(54580),d=e.i(1551),u=t([l]);[l]=u.then?(await u)():u;let p=(0,s.hoist)(l,"default"),m=(0,s.hoist)(l,"config"),T=new n.PagesAPIRouteModule({definition:{kind:r.RouteKind.PAGES_API,page:"/api/news",pathname:"/api/news",bundlePath:"",filename:""},userland:l,distDir:".next",relativeProjectDir:""});async function E(e,t,i){T.isDev&&(0,d.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let r="/api/news";r=r.replace(/\/index$/,"")||"/";let n=await T.prepare(e,t,{srcPage:r});if(!n){t.statusCode=400,t.end("Bad Request"),null==i.waitUntil||i.waitUntil.call(i,Promise.resolve());return}let{query:s,params:l,prerenderManifest:u,routerServerContext:E}=n;try{let i=e.method||"GET",a=(0,o.getTracer)(),n=a.getActiveScopeSpan(),d=T.instrumentationOnRequestError.bind(T),p=async n=>T.render(e,t,{query:{...s,...l},params:l,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:u.preview,propagateError:!1,dev:T.isDev,page:"/api/news",internalRevalidate:null==E?void 0:E.revalidate,onError:(...t)=>d(e,...t)}).finally(()=>{if(!n)return;n.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let e=a.getRootSpanAttributes();if(!e)return;if(e.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${e.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let s=e.get("next.route");if(s){let e=`${i} ${s}`;n.setAttributes({"next.route":s,"http.route":s,"next.span_name":e}),n.updateName(e)}else n.updateName(`${i} ${r}`)});n?await p(n):await a.withPropagatedContext(e.headers,()=>a.trace(c.BaseServerSpan.handleRequest,{spanName:`${i} ${r}`,kind:o.SpanKind.SERVER,attributes:{"http.method":i,"http.target":e.url}},p))}catch(e){if(T.isDev)throw e;(0,a.sendError)(t,500,"Internal Server Error")}finally{null==i.waitUntil||i.waitUntil.call(i,Promise.resolve())}}e.s(["config",0,m,"default",0,p,"handler",()=>E]),i()}catch(e){i(e)}},!1)];

//# sourceMappingURL=%5Broot-of-the-server%5D__b71e275b._.js.map