const CACHE_NAME = 'jotty-v3'
const PRECACHE_URLS = ['/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }
          return Promise.resolve()
        }),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const url = new URL(event.request.url)

  if (url.origin !== self.location.origin) {
    return
  }

  // 페이지(HTML)는 항상 네트워크 먼저 → 배포 반영 · 새로고침 시 최신 유지
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => void cache.put(event.request, copy))
          }
          return response
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/'))),
    )
    return
  }

  // JS/CSS/이미지 등: 네트워크 우선, 실패 시 캐시(오프라인)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => void cache.put(event.request, copy))
        }
        return response
      })
      .catch(() => caches.match(event.request)),
  )
})
