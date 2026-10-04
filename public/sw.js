// Service worker di Salvadanaio: rende l'app disponibile anche senza connessione.
// - Pagine: prima la rete (così arrivano gli aggiornamenti), se manca la rete la copia salvata.
// - File dell'app (JS, CSS, icone): dalla copia salvata, altrimenti dalla rete.
// I dati dell'utente non passano di qui: restano nel localStorage del browser.

const CACHE = 'salvadanaio';
const SHELL = ['./', './favicon.svg', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

/** Scarica la pagina principale e tutti i file che richiama, eliminando quelli delle versioni precedenti. */
async function cacheCurrentVersion() {
  const cache = await caches.open(CACHE);
  const response = await fetch('./', { cache: 'no-cache' });
  if (!response.ok) return;
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => new URL(m[1], self.registration.scope).href);
  await cache.put('./', response);
  await cache.addAll([...SHELL.slice(1), ...assets]);
  const keep = new Set([...assets, ...SHELL.map((p) => new URL(p, self.registration.scope).href)]);
  for (const request of await cache.keys()) if (!keep.has(request.url)) await cache.delete(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCurrentVersion().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Una nuova versione pubblicata: aggiorna la copia offline in background.
          if (response.ok) event.waitUntil(cacheCurrentVersion().catch(() => {}));
          return response;
        })
        .catch(async () => (await caches.match('./')) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && new URL(request.url).pathname.includes('/assets/')) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        }),
    ),
  );
});
