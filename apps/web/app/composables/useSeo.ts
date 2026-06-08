/**
 * Per-page Open Graph / Twitter metadata so links unfurl with a title, description,
 * and preview image. Resolves relative paths to absolute URLs (scrapers require
 * absolute og:image / og:url) using the configured base URL, falling back to the
 * request origin. The default preview is the branded card at /og.png (see
 * scripts/gen-og.mjs); a game page passes its own cover.
 *
 * SSR is what matters here (social scrapers don't run JS), so call this in setup
 * after any `await useFetch` so the page's data is already resolved server-side.
 */
interface DootSeoOptions {
  /** Document <title> (and Twitter title). Defaults to the site title. */
  title?: string
  /** og:title / twitter:title, if it should differ from the document title (e.g. a
   *  game page whose tab reads "X on Doot" but whose card headline is just "X"). */
  shareTitle?: string
  description?: string
  /** Preview image (absolute URL, or a path resolved against the site origin).
   *  Defaults to the branded /og.png card. */
  image?: string | null
  type?: 'website' | 'article' | 'profile'
  /** Canonical path/URL for og:url. Defaults to the current route path. */
  url?: string
  imageAlt?: string
}

const DEFAULT_TITLE = 'Doot, put a game on the big screen'
const DEFAULT_DESCRIPTION =
  'Self-hostable live party games. Host on a screen, everyone joins from their phone, no app, no account to play.'
const DEFAULT_IMAGE = '/og.png'

/**
 * Resolve a game's preview image the same way GameCover does: an explicit cover
 * wins, then a flagship's shipped screenshot, then the branded default. Keep the
 * flagship map in sync with packages/ui/src/components/GameCover.vue.
 */
const FLAGSHIP_COVER: Record<string, string> = {
  'quiz-or-die': '/covers/quiz-or-die.jpg',
  'circuit-cypher': '/covers/circuit-cypher.jpg',
  'open-mic': '/covers/open-mic.jpg',
}
export function gameOgImage(image: string | null | undefined, type: string | null | undefined): string {
  return image || (type ? FLAGSHIP_COVER[type] : undefined) || DEFAULT_IMAGE
}

export function useDootSeo(opts: DootSeoOptions = {}): void {
  const cfg = useRuntimeConfig()
  const route = useRoute()
  const reqUrl = useRequestURL()
  const origin = (cfg.public.baseUrl || reqUrl.origin || '').replace(/\/$/, '')
  const abs = (p?: string | null): string | undefined => {
    if (!p) return undefined
    if (/^https?:\/\//i.test(p)) return p
    return origin ? origin + (p.startsWith('/') ? p : `/${p}`) : p
  }

  const title = opts.title || DEFAULT_TITLE
  const shareTitle = opts.shareTitle || title
  const description = opts.description || DEFAULT_DESCRIPTION
  const rawImage = opts.image || DEFAULT_IMAGE
  const image = abs(rawImage)
  const isDefaultImage = rawImage === DEFAULT_IMAGE
  const url = abs(opts.url || route.path)

  useSeoMeta({
    title,
    description,
    ogTitle: shareTitle,
    ogDescription: description,
    ogType: opts.type || 'website',
    ogSiteName: 'Doot',
    ogUrl: url,
    ogImage: image,
    // The default card is exactly 1200x630; arbitrary covers let the scraper infer.
    ogImageWidth: isDefaultImage ? 1200 : undefined,
    ogImageHeight: isDefaultImage ? 630 : undefined,
    ogImageAlt: opts.imageAlt || shareTitle,
    twitterCard: 'summary_large_image',
    twitterTitle: shareTitle,
    twitterDescription: description,
    twitterImage: image,
  })
}
