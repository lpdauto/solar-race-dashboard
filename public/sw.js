const CACHE_NAME = 'solar-race-dashboard-v1'
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/day/1',
  '/day/2',
  '/day/3',
  '/day/4',
  '/day/5',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const requestUrl = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (requestUrl.origin === self.location.origin) {
    event.respondWith(cacheFirstSameOrigin(request))
    return
  }

  event.respondWith(fetch(request))
})

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)

  try {
    const response = await fetch(request)

    if (response.ok) {
      cache.put(request, response.clone())
    }

    return response
  } catch {
    const cachedExact = await cache.match(request)

    if (cachedExact) {
      return cachedExact
    }

    const requestUrl = new URL(request.url)
    const cachedPath = await cache.match(requestUrl.pathname)

    if (cachedPath) {
      return cachedPath
    }

    return cache.match('/') || Response.error()
  }
}

async function cacheFirstSameOrigin(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  if (cached) {
    return cached
  }

  const response = await fetch(request)

  if (response.ok && request.method === 'GET') {
    cache.put(request, response.clone())
  }

  return response
}
