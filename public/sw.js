// 더 이상 앱을 가로채지 않습니다. 기존에 이 파일을 쓰던 설치본이 한 번 더 받으면
// 캐시를 비우고 스스로 등록을 해제합니다.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach((client) => {
        client.navigate(client.url)
      })
    })(),
  )
})
