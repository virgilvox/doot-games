/**
 * Privacy-friendly page analytics via a self-hosted GoatCounter instance.
 *
 * Off by default: it does nothing unless `GOATCOUNTER_URL` is set (the origin of
 * the instance, e.g. https://stats.doot.games). When set, it loads GoatCounter's
 * tiny count.js and reports a pageview on first mount and on every client-side
 * route change (Doot is an SPA, so the script's own on-load count would miss
 * navigations). No cookies, no personal data; see docs/deploy.md for the setup.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const base = (useRuntimeConfig().public.goatcounterUrl as string)?.replace(/\/$/, '')
  if (!base || typeof document === 'undefined') return

  const script = document.createElement('script')
  script.async = true
  script.src = `${base}/count.js`
  script.dataset.goatcounter = `${base}/count`
  // Drive counts ourselves (below) so SPA navigations are tracked, not just load.
  script.dataset.goatcounterSettings = JSON.stringify({ no_onload: true, no_events: true })
  document.head.appendChild(script)

  let last = ''
  const track = (path: string) => {
    if (path === last) return
    last = path
    ;(window as unknown as { goatcounter?: { count?: (o: { path: string }) => void } }).goatcounter?.count?.({
      path,
    })
  }

  // Count the entry page once count.js has loaded, then every route change.
  nuxtApp.hook('app:mounted', () => track(location.pathname + location.search))
  useRouter().afterEach((to) => track(to.fullPath))
})
