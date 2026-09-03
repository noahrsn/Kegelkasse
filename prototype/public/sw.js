// Minimaler Service Worker.
//
// Zweck ist allein die Installierbarkeit: Chrome bietet "App installieren"
// (beforeinstallprompt) nur an, wenn ein Service Worker mit fetch-Handler
// registriert ist. Und installiert zu sein ist der Grund, warum die Anmeldung
// dann lange hält — iOS Safari räumt den Speicher einer normalen Website nach
// sieben Tagen ohne Nutzung ab, den einer installierten App nicht.
//
// Bewusst ohne eigenen Cache: Der wäre hier reine Fehlerquelle (veraltetes JS
// nach einem Deploy). Der fetch-Handler reicht jede Anfrage unverändert an den
// Browser durch.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', () => {
  // Kein respondWith() → der Browser lädt ganz normal aus Netz/HTTP-Cache.
})
