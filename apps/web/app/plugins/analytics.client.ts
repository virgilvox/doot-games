/**
 * Privacy-friendly page analytics via a self-hosted GoatCounter instance.
 *
 * Off by default: does nothing unless the runtime config `goatcounterUrl` is set
 * (override at runtime with the env var `NUXT_PUBLIC_GOATCOUNTER_URL`, e.g.
 * https://stats.doot.games). No cookies, no personal data; see docs/deploy.md.
 *
 * We drive the counts ourselves rather than relying on count.js's built-in
 * auto-count: that one binds to the page `load` event, which has already fired by
 * the time this client plugin injects the (async) script, so it never runs. So we
 * disable it (`no_onload`) and count on script load (the entry page) plus on each
 * later client-side route change (Doot is an SPA).
 */
type GoatCounter = { count?: (vars?: { path?: string }) => void }

export default defineNuxtPlugin(() => {
  const base = (useRuntimeConfig().public.goatcounterUrl as string)?.replace(/\/$/, '')
  if (!base || typeof document === 'undefined') return

  const count = (path?: string) =>
    (window as unknown as { goatcounter?: GoatCounter }).goatcounter?.count?.(path ? { path } : {})

  const script = document.createElement('script')
  script.async = true
  script.src = `${base}/count.js`
  script.dataset.goatcounter = `${base}/count`
  script.dataset.goatcounterSettings = JSON.stringify({ no_onload: true })
  script.onload = () => count() // the entry page, once count.js is ready
  document.head.appendChild(script)

  // Subsequent SPA navigations (skip the first callback: that is the entry page,
  // already counted on script load).
  let first = true
  useRouter().afterEach((to) => {
    if (first) {
      first = false
      return
    }
    count(to.fullPath)
  })
})
