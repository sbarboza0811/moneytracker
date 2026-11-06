/* MoneyTracker v7: offline APP SHELL only. Never cache user financial data or Supabase responses. */
const CACHE='moneytracker-shell-v45-hide-rights-20261106';
const SHELL=['./','./index.html','./app-v7.css','./app-v8.css','./app-v9.css','./engine-v7.js','./reconciliation-v7.js','./calculation-v1.js','./insights-v1.js','./app-v9.js','./cloud-v7.js','./ai-v1.js','./excel-v7.js','./config.js','./install-v7.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('moneytracker-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 e.respondWith(fetch(req).then(res=>{
  if(res.ok&&SHELL.some(p=>new URL(p,self.registration.scope).pathname===new URL(req.url).pathname)){
   const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
  }
  return res;
 }).catch(()=>caches.match(req,{ignoreSearch:true}).then(cached=>cached||Response.error())));
});