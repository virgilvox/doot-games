/**
 * Content-filter tiers for the free-text galleries (quip/fill -> vote/split/fibvote).
 * Pure + unit-tested. The host picks a tier in the lobby; the runtime masks the
 * DERIVED, about-to-be-published gallery text so the room never sees flagged words
 * on the big screen (the author still sees their own raw input on their phone).
 *
 * Scope note: this is a deliberately MINIMAL, slur-free starter list that catches
 * the common swears. A responsible, comprehensive filter (leetspeak/obfuscation,
 * slurs) wants a maintained source like the `obscenity` package, swap `maskText`'s
 * word sets for it without touching the call sites. See docs/flagship-games.md §6.
 */

export type FilterTier = 'off' | 'moderate' | 'strict'

/** Masked at `moderate` and `strict` (the common strong swears). Slur-free by
 *  design, see the file header: comprehensive slur coverage needs a maintained list. */
const STRONG = ['fuck', 'fucking', 'shit', 'bullshit', 'asshole', 'bitch', 'bastard', 'dick', 'cunt', 'piss', 'prick', 'twat', 'wank']
/** Additionally masked at `strict` (milder, for a family-friendly room). */
const MILD = ['damn', 'goddamn', 'hell', 'crap', 'ass', 'douche']

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function wordRe(tier: FilterTier): RegExp | null {
  const words = tier === 'strict' ? [...STRONG, ...MILD] : tier === 'moderate' ? STRONG : []
  if (!words.length) return null
  // Whole words only (case-insensitive) so "class" / "assess" are not false hits.
  return new RegExp(`\\b(?:${words.map(escapeRe).join('|')})\\b`, 'gi')
}

/** Mask flagged words in `text` per the tier, keeping length so layout is stable. */
export function maskText(text: string, tier: FilterTier): string {
  const re = wordRe(tier)
  if (!re || !text) return text
  return text.replace(re, (m) => '•'.repeat(m.length))
}

/** Mask the text of a derived round's gallery (vote `options` / split `scenarios`)
 *  before it is published. Returns a shallow clone; non-gallery shapes pass through. */
export function maskDerivedPublish(publish: unknown, tier: FilterTier): unknown {
  if (tier === 'off' || !publish || typeof publish !== 'object') return publish
  const p = publish as { options?: Array<{ text?: string }>; scenarios?: Array<{ text?: string }> }
  const maskList = <T extends { text?: string }>(items?: T[]) =>
    items?.map((it) => (typeof it.text === 'string' ? { ...it, text: maskText(it.text, tier) } : it))
  const out = { ...(publish as Record<string, unknown>) }
  if (p.options) out.options = maskList(p.options)
  if (p.scenarios) out.scenarios = maskList(p.scenarios)
  return out
}
