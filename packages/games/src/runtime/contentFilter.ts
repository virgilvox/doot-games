/**
 * Content-filter tiers for the free-text galleries (quip/fill -> vote/split/fibvote).
 * Pure + unit-tested. The host picks a tier in the lobby; the runtime masks the
 * DERIVED, about-to-be-published gallery text so the room never sees flagged words
 * on the big screen (the author still sees their own raw input on their phone).
 *
 * Detection uses `obscenity` (a focused, maintained library): an obfuscation-aware
 * English profanity/slur matcher that minimizes false positives (it won't flag
 * "class" or "assessment"). 'moderate' masks what obscenity flags; 'strict' adds a
 * small mild-word list for a family-friendly room.
 */
import { RegExpMatcher, TextCensor, englishDataset, englishRecommendedTransformers, fixedCharCensorStrategy } from 'obscenity'

export type FilterTier = 'off' | 'moderate' | 'strict'

// Built once and reused. Recommended transformers handle leetspeak/spacing tricks.
const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })
const censor = new TextCensor().setStrategy(fixedCharCensorStrategy('•'))

// Milder words obscenity leaves alone (it targets stronger profanity + slurs);
// masked only at the family-friendly 'strict' tier. Whole-word, case-insensitive.
const MILD = ['damn', 'goddamn', 'hell', 'crap', 'ass', 'arse', 'douche']
const mildRe = new RegExp(`\\b(?:${MILD.join('|')})\\b`, 'gi')

/** Mask flagged words in `text` per the tier, keeping length so layout is stable. */
export function maskText(text: string, tier: FilterTier): string {
  if (tier === 'off' || !text) return text
  // moderate + strict both run the obscenity matcher (slurs + strong profanity).
  let out = censor.applyTo(text, matcher.getAllMatches(text))
  // strict additionally masks the mild list for a family-friendly room.
  if (tier === 'strict') out = out.replace(mildRe, (m) => '•'.repeat(m.length))
  return out
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
