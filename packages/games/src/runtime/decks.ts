/**
 * Content-deck resolution: expand a deck-backed composition into a plain rounds
 * list for play. A round can DRAW rows ("cards") from a deck and either bind
 * individual fields to columns (mode 1) or build its whole content from a row via
 * the block's `pool` descriptor (mode 2). Pure + deterministic by the room seed, so
 * a room is internally consistent across reconnects but differs from other rooms.
 *
 * Reference-agnostic: it only ever sees INLINE decks (a `{ ref }` use is resolved to
 * inline by the serve/host-load layer before this runs). A round with no
 * draw/bindings/pool passes through untouched, so this is a no-op for existing games.
 *
 * MVP scope: deck-backed rounds are STANDALONE. Deck-backed make rounds feeding a
 * derived judge (two-phase pools) shift `from` indices on expansion and are a phase-2
 * concern; `from` is preserved literally here. See docs/content-decks-plan.md.
 */
import type { ContentPool, Deck, DeckUse, GamePlugin, GameComposition, RoundInstance } from '@doot-games/sdk'
import { getBlock, seededShuffle } from './derive'

const MAX_ROUNDS = 50

/**
 * Map a creator's attached deck to the rows a pool game's `buildConfig` expects.
 * Each row goes through the game's `fromRow`; unusable rows drop. An empty result
 * falls back to the built-in `defaultRows` (so a garbage/empty deck never breaks the
 * game). `merge: 'append'` keeps the built-in pool and adds the creator's on top.
 */
export function poolRowsFor(pool: ContentPool, deck: Deck): Array<Record<string, string | number>> {
  const mapped = deck.rows.map((r) => pool.fromRow(r)).filter((r): r is Record<string, string | number> => r != null)
  if (mapped.length === 0) return pool.defaultRows
  return pool.merge === 'append' ? [...pool.defaultRows, ...mapped] : mapped
}

/**
 * A "Prompt Deck" row → a single-`prompt` pool row, shared by the prompt-style pool
 * games (Quip Clash, Open Mic, …). Reads the conventional `prompt` column, else the
 * first non-empty text cell, so any one-text-column deck feeds them regardless of how
 * the creator named the column. Returns null for a row with no usable text.
 */
export function promptFromRow(row: Record<string, string | number>): { prompt: string } | null {
  const direct = typeof row.prompt === 'string' && row.prompt.trim() ? row.prompt : undefined
  const v = direct ?? Object.values(row).find((x) => typeof x === 'string' && x.trim())
  return typeof v === 'string' && v.trim() ? { prompt: v } : null
}

/** Deep clone of round content (always JSON-safe game data). JSON-based on purpose:
 *  it reads cleanly through a Vue reactive proxy, where `structuredClone` can throw. */
function clone<T>(v: T): T {
  return v == null ? v : (JSON.parse(JSON.stringify(v)) as T)
}

/** Pull the inline decks out of a config's `decks` map (references are dropped here;
 *  they are resolved to inline upstream). */
export function inlineDecks(uses: Record<string, DeckUse> | undefined): Record<string, Deck> {
  const out: Record<string, Deck> = {}
  for (const [id, use] of Object.entries(uses ?? {})) {
    if ('inline' in use && use.inline) out[id] = use.inline
  }
  return out
}

/** Set a dotted path (e.g. `options.0.label`) on `obj` in place, but ONLY if the
 *  path already exists (a binding fills an authored field; it never creates shape).
 *  Returns whether it set. */
function setPath(obj: unknown, path: string, value: unknown): boolean {
  const parts = path.split('.')
  let cur: unknown = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return false
    cur = (cur as Record<string, unknown>)[parts[i]!]
  }
  const leaf = parts[parts.length - 1]!
  if (cur == null || typeof cur !== 'object' || !(leaf in (cur as object))) return false
  ;(cur as Record<string, unknown>)[leaf] = value
  return true
}

/** The k-th card from a deck under a stable per-(round, deck) seeded shuffle; cycles
 *  if k exceeds the row count. `undefined` for an empty/missing deck. */
function drawRow(deck: Deck | undefined, seedKey: string, k: number): Record<string, string | number> | undefined {
  if (!deck || deck.rows.length === 0) return undefined
  const shuffled = seededShuffle(seedKey)(deck.rows)
  return shuffled[k % shuffled.length]
}

/**
 * Expand `config.rounds` against its decks for one play. Each round either passes
 * through unchanged (no draw/bindings/pool and `draw <= 1`) or emits `draw` instances
 * (default 1), each drawing a distinct card per referenced deck — fields bound to the
 * same deck in one instance share that card (cross-field correlation). Clamped to the
 * 50-round cap. `resolvedDecks` overrides the inline decks (the serve layer passes the
 * ref-resolved map); otherwise the config's inline decks are used.
 */
export function resolveComposition(
  plugin: GamePlugin,
  config: GameComposition,
  seed: string,
  resolvedDecks?: Record<string, Deck>,
): GameComposition {
  const decks = resolvedDecks ?? inlineDecks(config.decks)
  const out: RoundInstance[] = []
  config.rounds.forEach((r, i) => {
    const n = Math.max(1, Math.floor(r.draw ?? 1))
    if (!r.pool && !r.bindings && n === 1) {
      out.push(r)
      return
    }
    for (let k = 0; k < n; k++) {
      const from = r.from ? { from: r.from } : {}
      if (r.pool) {
        // Mode 2: the whole content from one row via the block's typed descriptor.
        const row = drawRow(decks[r.pool.deck], `${seed}:${i}:${r.pool.deck}`, k)
        const block = getBlock(plugin, r.block)
        const content =
          row && block?.pool ? block.pool.fromRow(row, (r.content ?? {}) as never) : clone(r.content)
        out.push({ block: r.block, content, ...from })
      } else {
        // Mode 1: clone the authored content, fill each bound field from its drawn row.
        const content = clone(r.content)
        const rowByDeck = new Map<string, Record<string, string | number> | undefined>()
        for (const [fieldPath, ref] of Object.entries(r.bindings ?? {})) {
          if (!rowByDeck.has(ref.deck)) rowByDeck.set(ref.deck, drawRow(decks[ref.deck], `${seed}:${i}:${ref.deck}`, k))
          const val = rowByDeck.get(ref.deck)?.[ref.column]
          if (val !== undefined) setPath(content, fieldPath, val)
        }
        out.push({ block: r.block, content, ...from })
      }
    }
  })
  return { title: config.title, rounds: out.slice(0, MAX_ROUNDS) }
}
