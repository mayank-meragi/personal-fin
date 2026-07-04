/* Service worker: PWA installability, offline shell, and the share-target sink.
   GitHub Pages is static, so the POST share is intercepted here, stashed in the
   Cache API, and the app reads it on next load. */
const BASE = '/personal-fin/'
const SHELL_CACHE = 'pf-shell-v1'
const SHARE_CACHE = 'pf-share'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Android share sheet POSTs here; stash payload and bounce into the app
  if (event.request.method === 'POST' && url.pathname === BASE + 'share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData()
          const cache = await caches.open(SHARE_CACHE)
          const text = [formData.get('title'), formData.get('text'), formData.get('url')]
            .filter((v) => typeof v === 'string' && v)
            .join(' ')
          if (text) await cache.put('shared-text', new Response(text))
          const file = formData.getAll('screenshots').find((f) => f instanceof File && f.size > 0)
          if (file) {
            await cache.put('shared-image', new Response(file, { headers: { 'Content-Type': file.type } }))
          }
        } catch {
          // Malformed share — just open the app
        }
        return Response.redirect(BASE + '?share=1', 303)
      })(),
    )
    return
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return

  // Network-first with cache fallback: the app shell keeps working offline
  // (data already lives in localStorage on the client side)
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request)
        if (response.ok && (url.pathname.startsWith(BASE) || url.pathname === BASE)) {
          const cache = await caches.open(SHELL_CACHE)
          cache.put(event.request, response.clone())
        }
        return response
      } catch {
        const cached = await caches.match(event.request)
        if (cached) return cached
        if (event.request.mode === 'navigate') {
          const shell = await caches.match(BASE)
          if (shell) return shell
        }
        throw new Error('offline and not cached')
      }
    })(),
  )
})
