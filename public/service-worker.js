const cachePrefix = 'boussole-app-';
const version = new URL(self.location.href).searchParams.get('v');
const cacheName = cachePrefix + version;

const pages = new Set([
  '/dashboard', '/projection', '/budget', '/plus', '/reglages', '/revenus', '/charges',
  '/dettes', '/enfants', '/objectifs', '/conseils', '/sauvegarde', '/demo',
  '/confidentialite', '/mentions-legales', '/simulation', '/synchronisation',
]);

const appAssets = [
  '/favicon.ico',
  '/manifest.webmanifest',
  '/icons/boussole-180.png',
  '/icons/boussole-192.png',
  '/icons/boussole-512.png',
];

async function prepareOfflinePages() {
  const cache = await caches.open(cacheName);
  const assets = new Set(appAssets);
  await Promise.all([...pages].map(async (path) => {
    // All HTML is public. The personal budget is loaded later from localStorage.
    const response = await fetch(path, { cache: 'reload', credentials: 'omit', headers: { Accept: 'text/html' } });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('text/html')) {
      throw new Error(`Page indisponible : ${path}`);
    }
    const html = await response.clone().text();
    for (const match of html.matchAll(/\/_next\/static\/[\w.~/+%-]+/g)) assets.add(match[0]);
    // Keep the CSP header paired with the nonce in this copy of the document.
    await cache.put(path, response);
  }));
  await cache.addAll([...assets]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(prepareOfflinePages());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter((key) => key.startsWith(cachePrefix) && key !== cacheName);
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fetchPage(request, path) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(cacheName);
    const response = await cache.match(path, { ignoreVary: true });
    if (response) return response;
    throw error;
  }
}

async function fetchAsset(request) {
  const cache = await caches.open(cacheName);
  const response = await cache.match(request, { ignoreSearch: true });
  return response ?? fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const path = url.pathname === '/' ? '/dashboard' : url.pathname;
  if (pages.has(path) && (request.mode === 'navigate' || request.headers.has('rsc'))) {
    // Next falls back to a document navigation when a Flight request gets HTML.
    event.respondWith(fetchPage(request, path));
  } else if (url.pathname.startsWith('/_next/static/') || appAssets.includes(url.pathname)) {
    event.respondWith(fetchAsset(request));
  }
});
