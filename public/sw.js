const CACHE='ros-shell-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/app.js','/ros-navigation.js','/restaurant.js','/restaurant-qr.js','/page-cache.js','/easy-ui.js','/guided-invoice.js','/invoice-design.js','/whatsapp-invoice.js','/invoice-review.js','/invoice-theme.css','/workspace-theme.css','/workspace-design.js','/workspace-logo.js','/invoice-export.js','/sale-feedback.js','/style.css','/login.css','/overview.css','/ros-brand.svg','/ros-icon-192.png','/ros-icon-512.png','/form-studio.css','/form-catalog.js','/business-forms.js','/form-records.js','/product-photo.js','/monthly-chart.js','/currency.js','/countries.js','/manifest.webmanifest','/i18n.json']))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ros-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin||u.pathname.startsWith('/api/')||e.request.method!=='GET')return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('/'):Response.error()))));});

self.addEventListener('push',event=>event.waitUntil((async()=>{
 try{
  const subscription=await self.registration.pushManager.getSubscription();
  if(!subscription)return;
  const response=await fetch('/api/restaurant/alerts',{credentials:'same-origin',cache:'no-store',headers:{'X-BOS-Push-Endpoint':subscription.endpoint}});
  if(!response.ok)return;
  const alerts=await response.json();
  const history=await caches.open('ros-restaurant-alerts');
  const labels={order:'New order',waiter:'Call waiter',bill:'Bill requested'};
  for(const alert of alerts){
   const seen='/restaurant-alert/'+encodeURIComponent(alert.id);
   const prior=await history.match(seen);
   if(prior&&Date.now()-Number(await prior.text())<86400000)continue;
   await self.registration.showNotification(labels[alert.kind]+' · '+alert.table_name,{tag:alert.id,icon:'/ros-icon-192.png',data:{url:'/#restaurant'},vibrate:[100,70,100]});
   await history.put(seen,new Response(String(Date.now())));
  }
  for(const key of (await history.keys()).slice(0,-100))await history.delete(key);
 }catch{/* In-app polling remains available. */}
})()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const app=windows.find(client=>new URL(client.url).pathname==='/');
  if(app){await app.navigate('/#restaurant');await app.focus();}
  else await self.clients.openWindow('/#restaurant');
 })());
});
