/**
 * Service Worker — Teknikal Analis 1 (Makkuraga Grup)
 *
 * Tugasnya CUMA satu: bikin halaman ini (app shell) bisa kebuka waktu HP
 * offline. Ini TIDAK menangani pengiriman data ke GAS — itu ditangani
 * penuh di dalam halaman sendiri (IndexedDB queue + auto-retry saat online),
 * karena background sync lewat Service Worker untuk endpoint GAS lebih
 * rapuh dan sulit didebug daripada retry langsung di halaman.
 *
 * Strategi cache:
 * - Halaman (index.html / navigasi) -> NETWORK-FIRST: kalau online selalu
 *   ambil versi terbaru (dan simpan ke cache), kalau offline baru pakai
 *   salinan cache. Ini supaya perubahan daftar komponen di form langsung
 *   kepakai di HP semua orang tanpa harus hapus cache manual.
 * - Aset lain (manifest, icon) -> cache-first, supaya cepat.
 * - Request ke luar (Google Apps Script, Google Sheets, gstatic, dsb)
 *   -> selalu lewat network langsung, TIDAK di-cache, karena data itu
 *   harus selalu yang terbaru.
 *
 * Setiap kali struktur form berubah, naikkan CACHE_NAME (v3 -> v4, dst)
 * supaya cache lama dibuang saat service worker baru aktif.
 */

const CACHE_NAME = 'ta-shell-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

function isPage(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Hanya urus request ke domain sendiri (app shell). Request ke domain lain
  // (script.google.com, fonts.googleapis.com, dst) dibiarkan lewat network
  // apa adanya — jangan diintersep, biar tidak mengganggu submit data.
  if (url.origin !== self.location.origin) return;

  if (request.method !== 'GET') return;

  // Halaman: network-first, fallback ke cache saat offline.
  if (isPage(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Aset statis: cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});