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
 * - App shell (HTML, manifest, icon) -> cache-first, supaya tetap kebuka
 *   walau offline, dan tetap cepat walau online.
 * - Request ke luar (Google Apps Script, Google Sheets, gstatic, dsb)
 *   -> selalu lewat network langsung, TIDAK di-cache, karena data itu
 *   harus selalu yang terbaru.
 */

const CACHE_NAME = 'ta-shell-v2';
const APP_SHELL = [
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Hanya urus request ke domain sendiri (app shell). Request ke domain lain
  // (script.google.com, fonts.googleapis.com, dst) dibiarkan lewat network
  // apa adanya — jangan diintersep, biar tidak mengganggu submit data.
  if (url.origin !== self.location.origin) return;

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Simpan salinan terbaru ke cache supaya update ikut kepakai
          // lain kali (tanpa menunggu deploy ulang service worker).
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached); // offline & belum ke-cache -> tidak ada fallback lain
    })
  );
});
