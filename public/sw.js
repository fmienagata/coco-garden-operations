/**
 * Service worker du poste.
 *
 * Next gère la reprise des navigations quand le réseau revient, mais un rechargement
 * complet de la page pendant une coupure échoue toujours : le navigateur a besoin du
 * réseau pour obtenir le HTML. C'est le rôle de ce fichier. Sans lui, un serveur qui
 * verrouille puis rallume sa tablette pendant une coupure se retrouve devant une page
 * blanche, et le travail hors ligne ne vaut plus rien.
 */

const VERSION = 'v2';
const SHELL = `coco-shell-${VERSION}`;
const DATA = `coco-data-${VERSION}`;

// Écrans dont la coque doit être disponible même sans réseau.
const SHELL_ROUTES = ['/cuisine', '/salle', '/livraison', '/poste'];

// Rien de ce qui touche à l'authentification ou à la reprise ne doit être servi
// depuis un cache : une réponse périmée y serait au mieux trompeuse.
const NEVER_CACHE = ['/api/auth/', '/api/sync', '/api/number-leases', '/api/devices'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_ROUTES).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL && key !== DATA).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Les écritures ne sont jamais interceptées : la file hors ligne s'en charge, et un
  // service worker qui rejouerait une écriture doublerait une commande.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((path) => url.pathname.startsWith(path))) return;

  // Les ressources Next portent une empreinte dans leur nom : elles ne changent jamais.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL).catch(async () => {
        // Rien d'autre que l'écran demandé : replier sur la Cuisine afficherait la Cuisine
        // sous l'URL d'un autre module, et l'écran manquant passerait pour un écran cassé.
        const cached = await caches.match(url.pathname);
        return (
          cached ||
          new Response(
            '<!doctype html><meta charset="utf-8"><title>Hors ligne</title>' +
              '<body style="font-family:system-ui;padding:24px">' +
              '<h1>Poste hors ligne</h1>' +
              "<p>Cet écran n'a pas encore été enregistré sur ce poste. Ouvrez-le une fois en étant connecté.</p>" +
              '</body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          )
        );
      }),
    );
    return;
  }

  // Lectures métier : le réseau d'abord, la dernière réponse connue ensuite. Un tableau
  // de préparation périmé de deux minutes reste plus utile qu'un écran vide.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA));
  }
});
