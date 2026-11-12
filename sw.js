/* PM MKG - service worker
   Naikkan angka VERSI setiap kali index.html diperbarui agar HP mengambil versi baru. */
const VERSI='pm-mkg-v4';
const SHELL=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(VERSI)
    .then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{}))))
    .then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(k=>Promise.all(k.filter(x=>x!==VERSI).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  /* Apps Script (data), CDN, dan semua domain lain: langsung ke jaringan, tidak pernah di-cache di sini */
  if(u.origin!==location.origin)return;

  /* Halaman utama: ambil dari jaringan dulu (selalu versi terbaru), cadangan dari cache saat offline */
  if(r.mode==='navigate'){
    e.respondWith(
      fetch(r).then(res=>{
        const cp=res.clone();
        caches.open(VERSI).then(c=>c.put('./index.html',cp));
        return res;
      }).catch(()=>caches.match('./index.html').then(h=>h||caches.match('./')))
    );
    return;
  }

  /* File statis (ikon, manifest): cache dulu, perbarui di latar belakang */
  e.respondWith(
    caches.match(r).then(h=>{
      const net=fetch(r).then(res=>{
        if(res&&res.ok){const cp=res.clone();caches.open(VERSI).then(c=>c.put(r,cp))}
        return res;
      }).catch(()=>h);
      return h||net;
    })
  );
});