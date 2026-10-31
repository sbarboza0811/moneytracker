/* MoneyTracker shell offline. Never caches Supabase API responses or personal financial records. */
const CACHE='moneytracker-shell-v4';
const SHELL=['./','./index.html','./cloud.css','./ui-v2.css','./ui-v2.css','./cloud.js','./config.js','./manifest.webmanifest','./install.js','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('moneytracker-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;event.respondWith(fetch(req).then(response=>{if(response.ok&&SHELL.some(p=>new URL(p,self.registration.scope).pathname===new URL(req.url).pathname)){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return response;}).catch(()=>caches.match(req).then(cached=>cached||Response.error())));});
