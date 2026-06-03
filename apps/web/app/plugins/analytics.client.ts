/**
 * Privacy-friendly page analytics via a self-hosted GoatCounter instance.
 *
 * Off by default: does nothing unless the runtime config `goatcounterUrl` is set
 * (override at runtime with the env var `NUXT_PUBLIC_GOATCOUNTER_URL`, e.g.
 * https://stats.doot.games). When set, it loads GoatCounter's tiny count.js,
 * which counts the initial page load itself; we add a count on each subsequent
 * client-side route change (Doot is an SPA). No cookies, no personal data; see
 * docs/deploy.md for setup.
 */
export default defineNuxtPlugin(() => {
  const base = (useRuntimeConfig().public.goatcounterUrl as string)?.replace(/\/$/, '')
  if (!base || typeof document === 'undefined') return

  const script = document.createElement('script')
  script.async = true
  script.src = `${base}/count.js`
  script.dataset.goatcounter = `${base}/count`
  document.head.appendChild(script)

  // count.js counts the entry page on load. Skip the first router callback (that
  // same initial load) and report each later navigation; guard in case count.js
  // is still loading on a very fast nav.
  let first = true
  useRouter().afterEach((to) => {
    if (first) {
      first = false
      return
    }
    ;(window as unknown as { goatcounter?: { count?: (o: { path: string }) => void } }).goatcounter?.count?.({
      path: to.fullPath,
    })
  })
})
