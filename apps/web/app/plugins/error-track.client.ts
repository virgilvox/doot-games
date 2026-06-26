/**
 * Capture client-side errors (Vue render errors, uncaught errors, unhandled promise
 * rejections) and report them to /api/client-errors, so a host/player device blowing
 * up is visible to the operator (admin console) instead of silent. Deduped by message
 * and throttled so a render loop can't spam the endpoint; fire-and-forget so reporting
 * never itself breaks the page. Auto-registered by Nuxt (.client.ts).
 */
export default defineNuxtPlugin((nuxtApp) => {
  if (typeof window === 'undefined') return

  const seen = new Set<string>()
  let lastSentAt = 0
  const THROTTLE_MS = 3000

  const report = (message: unknown, stack?: string, kind = 'error') => {
    const msg = typeof message === 'string' ? message : (message as Error)?.message || String(message)
    if (!msg) return
    const key = `${kind}:${msg}`.slice(0, 200)
    if (seen.has(key)) return
    const now = Date.now()
    // Throttle BEFORE marking seen, so a distinct error throttled here can still be
    // reported when it recurs (otherwise co-occurring distinct errors are lost).
    if (now - lastSentAt < THROTTLE_MS) return
    seen.add(key)
    if (seen.size > 100) seen.clear()
    lastSentAt = now
    // Fire-and-forget; reporting must never throw into the page.
    $fetch('/api/client-errors', {
      method: 'POST',
      body: { message: msg.slice(0, 500), stack: stack?.slice(0, 4000), url: location.pathname, kind },
    }).catch(() => {})
  }

  nuxtApp.hook('vue:error', (err) => report((err as Error)?.message ?? err, (err as Error)?.stack, 'vue'))
  window.addEventListener('error', (e) => report(e.message, e.error?.stack, 'window'))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    report(r?.message ?? r, r?.stack, 'promise')
  })
})
