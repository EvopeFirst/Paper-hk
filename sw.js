const prefix='kjw-shell-'+self.registration.scope+'-',version=prefix+'0.1.3'
const files=['./','./index.html','./reader.mjs','./oss.mjs','./style.css','./manifest.webmanifest','./icon.svg']
self.addEventListener('install',e=>e.waitUntil(caches.open(version).then(c=>c.addAll(files.map(f=>new Request(f,{cache:"reload"})))).then(()=>self.skipWaiting())))
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(prefix)&&k!==version).map(k=>caches.delete(k)))).then(()=>self.clients.claim())))
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin)e.respondWith(caches.open(version).then(async c=>await c.match(e.request)||await fetch(e.request)))})