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
 * Whether a creator deck (by its column keys) can feed a pool game: every required column
 * group must have at least one matching column (case-insensitive). A pool with no `requires`
 * (single-text-column games) accepts any deck. Pure, so the remix picker and tests share it.
 */
export function deckMatchesPool(columns: string[], pool: ContentPool): boolean {
  if (!pool.requires?.length) return true
  const have = new Set(columns.map((c) => c.toLowerCase()))
  return pool.requires.every((group) => group.some((k) => have.has(k.toLowerCase())))
}

/**
 * A small, editable STARTER drawn from a game's official built-in pool, for the
 * "remix" warm start: rather than a blank deck, a creator begins from a handful of the
 * official rows and tweaks them. Returns the primary text column key and the first `n`
 * values of it (deduped, non-empty). Single-text-column pools only (prompt/template/frame
 * shaped); a multi-column pool returns `single: false` so the UI routes elsewhere. Pure.
 */
export function poolStarter(pool: ContentPool, n = 6): { single: boolean; key: string; values: string[] } {
  const first = pool.defaultRows[0] ?? {}
  const textKeys = Object.keys(first).filter((k) => typeof first[k] === 'string')
  // "Single column" = one meaningful text field (prompt/frame/template). A 'blanks' helper
  // column (Mad Libs) rides along but is derived, so it does not count against single-ness.
  const key = textKeys.find((k) => k !== 'blanks') ?? textKeys[0] ?? ''
  const meaningful = textKeys.filter((k) => k !== 'blanks')
  const single = meaningful.length === 1 && (pool.deckKind === 'prompt' || pool.deckKind === 'generic')
  const seen = new Set<string>()
  const values: string[] = []
  for (const row of pool.defaultRows) {
    const v = row[key]
    if (typeof v === 'string' && v.trim() && !seen.has(v)) {
      seen.add(v)
      values.push(v)
      if (values.length >= n) break
    }
  }
  return { single, key, values }
}

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

// ── Typed-pool row mappers ──────────────────────────────────────────────────
// A creator deck row is an arbitrary `Record<string, string | number>`; each pool
// game maps it to its own flat pool-row shape via one of these. They read by
// CONVENTIONAL column name first (so a well-named deck "just works"), with a
// positional text fallback, and return null to skip a row that can't be used.
// Each is pure + unit-tested. The game's `buildConfig` consumes the flat rows.

/** First non-empty cell among the given column keys, trimmed; '' if none. A numeric
 *  cell is stringified (so a number column still reads as text where wanted). */
function pick(row: Record<string, string | number>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Every non-empty TEXT cell of a row, in insertion order (for positional fallbacks). */
function texts(row: Record<string, string | number>): string[] {
  return Object.values(row)
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
}

/** Split the Room: one dividing frame with an `{x}` blank the player completes. Any
 *  single `{...}` placeholder is normalized to `{x}`; a frame with none gets ` {x}`
 *  appended so `fill` always has a blank to render. */
export function frameFromRow(row: Record<string, string | number>): { frame: string } | null {
  let v = pick(row, ['frame', 'prompt', 'dilemma']) || texts(row)[0] || ''
  if (!v) return null
  if (!v.includes('{x}')) v = /\{[^}]+\}/.test(v) ? v.replace(/\{[^}]+\}/, '{x}') : `${v} {x}`
  return { frame: v }
}

/** Would You Rather: two choices. Reads `a`/`b` (or left/right/this/that/option1/2),
 *  else the first two distinct text cells. Skips a row without two distinct choices. */
export function binaryFromRow(row: Record<string, string | number>): { a: string; b: string } | null {
  const a = pick(row, ['a', 'left', 'this', 'option1', 'optiona']) || texts(row)[0] || ''
  const b = pick(row, ['b', 'right', 'that', 'option2', 'optionb']) || texts(row).find((x) => x !== a) || ''
  return a && b && a !== b ? { a, b } : null
}

/** Over/Under: a prompt + which side is correct (0 = Over, 1 = Under). Reads an
 *  explicit `correct`/`answer`/`side` (over/under text, or a 0/1 index), else derives
 *  it from a `threshold` + `actual` number. Skips a row with no usable side. */
export function overUnderFromRow(row: Record<string, string | number>): { prompt: string; correct: number } | null {
  const prompt = pick(row, ['prompt', 'question', 'q']) || texts(row)[0] || ''
  let correct = -1
  const c = pick(row, ['correct', 'answer', 'side'])
  if (c === '0' || c === '1') correct = Number(c)
  else if (/^(over|higher|more|greater|above)/i.test(c)) correct = 0
  else if (/^(under|lower|less|fewer|below)/i.test(c)) correct = 1
  else {
    const threshold = Number(pick(row, ['threshold', 'line']).replace(/[,\s]/g, ''))
    const actual = Number(pick(row, ['actual', 'value', 'real']).replace(/[,\s]/g, ''))
    if (Number.isFinite(threshold) && Number.isFinite(actual) && threshold !== actual) correct = actual > threshold ? 0 : 1
  }
  return prompt && (correct === 0 || correct === 1) ? { prompt, correct } : null
}

/** Spectrum: a subject + the two dial poles. Reads `left`/`right` (or low/high,
 *  min/max, a/b); a bare prompt deck with no poles falls back to Disagree/Agree, so
 *  any one-column prompt deck still works. Skips a row with no prompt. */
export function spectrumFromRow(
  row: Record<string, string | number>,
): { prompt: string; left: string; right: string } | null {
  const prompt = pick(row, ['prompt', 'subject', 'question', 'statement']) || texts(row)[0] || ''
  if (!prompt) return null
  const left = pick(row, ['left', 'low', 'min', 'start', 'a']) || 'Disagree'
  const right = pick(row, ['right', 'high', 'max', 'end', 'b']) || 'Agree'
  return { prompt, left, right }
}

/** Survey (Family Feud): a question + its board. The board rides one `answers`/
 *  `board` column as "Text:points | Text:points | ..." (points optional; the game
 *  parses + rank-scores it). Skips a row missing the question or the board. */
export function surveyFromRow(row: Record<string, string | number>): { prompt: string; answers: string } | null {
  const prompt = pick(row, ['prompt', 'question', 'q']) || texts(row)[0] || ''
  const answers = pick(row, ['answers', 'board', 'responses', 'survey'])
  return prompt && answers ? { prompt, answers } : null
}

/** Faker: a public category + the secret word. */
export function secretFromRow(row: Record<string, string | number>): { category: string; word: string } | null {
  const category = pick(row, ['category', 'topic', 'theme'])
  const word = pick(row, ['word', 'secret', 'answer'])
  const t = texts(row)
  const c = category || t[0] || ''
  const w = word || t.find((x) => x !== c) || ''
  return c && w ? { category: c, word: w } : null
}

/** Fib Finder: a trivia question (with an optional `___` blank) + its true answer. */
export function factFromRow(row: Record<string, string | number>): { question: string; truth: string } | null {
  const question = pick(row, ['question', 'prompt', 'q'])
  const truth = pick(row, ['truth', 'answer', 'a'])
  const t = texts(row)
  const q = question || t[0] || ''
  const tr = truth || t.find((x) => x !== q) || ''
  return q && tr ? { question: q, truth: tr } : null
}

/** Type the Answer: a trivia question + its accepted answer(s). Synonyms may be
 *  delimited (`|`, `;`, or `,`) in one `answers`/`answer` column; the game splits
 *  them. `answers` is kept as the raw delimited string for the flat pool row (the
 *  game's buildConfig splits it). Skips a row missing a question or an answer. */
export function answerRowFromRow(
  row: Record<string, string | number>,
): { prompt: string; answers: string } | null {
  const prompt = pick(row, ['question', 'prompt', 'q']) || texts(row)[0] || ''
  const answers = pick(row, ['answers', 'answer', 'a'])
  const p = prompt
  const a = answers || texts(row).find((x) => x !== p) || ''
  return p && a ? { prompt: p, answers: a } : null
}

/** Ballpark: a numeric-answer question (+ optional unit/subject). Commas/spaces in the
 *  number are tolerated; a row with no parseable number is skipped. */
export function ballparkFromRow(
  row: Record<string, string | number>,
): { prompt: string; answer: number; unit: string; subject: string } | null {
  const prompt = pick(row, ['prompt', 'question', 'q']) || texts(row)[0] || ''
  const answerRaw = pick(row, ['answer', 'value', 'number'])
  const answer = Number(answerRaw.replace(/[,\s]/g, ''))
  if (!prompt || !answerRaw || !Number.isFinite(answer)) return null
  return { prompt, answer, unit: pick(row, ['unit', 'units']), subject: pick(row, ['subject']) }
}

/** What, You Didn't Know That?: a multiple-choice question. Options come from a single
 *  delimited column (`|`, `;`, or `,`) or from `option1..optionN`/`a..d` columns; the
 *  correct answer is a 1-based index, a 0-based index, or the answer text. Returns the
 *  options pipe-joined and a 0-based correct index (the buzzer round splits them back). */
/** The option list of a multiple-choice row: a single delimited `options`/`choices` column
 *  (preferring `|` then `;` then `,`, so an option that contains a comma is not torn apart)
 *  or `option1..optionN`/`a..d` columns. */
function optionList(row: Record<string, string | number>): string[] {
  const joined = pick(row, ['options', 'choices'])
  if (joined) {
    const sep = joined.includes('|') ? '|' : joined.includes(';') ? ';' : ','
    return joined.split(sep).map((s) => s.trim()).filter(Boolean)
  }
  const out: string[] = []
  for (const k of ['option1', 'option2', 'option3', 'option4', 'option5', 'option6', 'a', 'b', 'c', 'd']) {
    const v = pick(row, [k])
    if (v) out.push(v)
  }
  return out
}

export function choiceFromRow(
  row: Record<string, string | number>,
): { prompt: string; options: string; correct: number } | null {
  const prompt = pick(row, ['prompt', 'question', 'q']) || texts(row)[0] || ''
  const options = optionList(row)
  if (!prompt || options.length < 2) return null
  const correctRaw = pick(row, ['correct', 'answer'])
  let correct = -1
  const asNum = Number(correctRaw)
  if (correctRaw && Number.isFinite(asNum) && correctRaw.trim() !== '') {
    correct = asNum >= 1 && asNum <= options.length ? asNum - 1 : asNum
  } else if (correctRaw) {
    correct = options.findIndex((o) => o.toLowerCase() === correctRaw.toLowerCase())
  }
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) correct = 0
  return { prompt, options: options.join('|'), correct }
}

/** Truth or Share: one prompt row tagged with which of the game's four pools it feeds.
 *  `kind` (truth/share) and `tier` (mild/spicy) come from optional columns and default to
 *  truth/mild, so a plain prompt deck still works (it fills the truth-mild pool). The game's
 *  buildConfig partitions these tagged rows into its four prompt arrays. Pure. */
const SPOTLIGHT_META = new Set(['kind', 'type', 'mode', 'tier', 'spice', 'level'])
export function spotlightRowFromRow(
  row: Record<string, string | number>,
): { kind: 'truth' | 'share'; tier: 'mild' | 'spicy'; prompt: string } | null {
  // The fallback skips the kind/tier metadata columns, so a row of only metadata (no actual
  // prompt) is dropped rather than treating "truth" or "mild" as the prompt text.
  const fallback = Object.entries(row).find(([k, v]) => !SPOTLIGHT_META.has(k.toLowerCase()) && typeof v === 'string' && v.trim())?.[1]
  const prompt = pick(row, ['prompt', 'text', 'question', 'dare']) || (typeof fallback === 'string' ? fallback.trim() : '')
  if (!prompt) return null
  const kind = /shar|photo|pic/i.test(pick(row, ['kind', 'type', 'mode'])) ? 'share' : 'truth'
  const tier = /spic|hot|adult|bold/i.test(pick(row, ['tier', 'spice', 'level'])) ? 'spicy' : 'mild'
  return { kind, tier, prompt }
}

/** Quiz or Die: a trivia question with a lurid category. Same multiple-choice shape as
 *  `choiceFromRow` (so a plain Quiz Deck works too) plus an optional `category` column;
 *  the correct option is withheld from non-owners. Returns the flat row Quiz or Die's
 *  buildConfig consumes; null when there is no usable question. */
export function cellarQuestionFromRow(
  row: Record<string, string | number>,
): { cat: string; question: string; options: string; correct: number } | null {
  const choice = choiceFromRow(row)
  if (!choice) return null
  return { cat: pick(row, ['category', 'cat', 'topic', 'theme']), question: choice.prompt, options: choice.options, correct: choice.correct }
}

/** Quiz or Die, mixed deck: a row is either a trivia QUESTION or a finale "tap all that
 *  belong" CATEGORY. A finale row carries a `belong` column (a pipe list of the options that
 *  belong); the game's buildConfig routes belong-bearing rows to the finale pool and the rest
 *  to the question pool. `belong` is the withheld finale answer. Pure. */
export function cellarRowFromRow(row: Record<string, string | number>): Record<string, string | number> | null {
  const belong = pick(row, ['belong', 'belongs', 'correct_set'])
  if (belong) {
    const options = optionList(row)
    if (options.length < 2) return null
    return { cat: pick(row, ['category', 'cat', 'topic', 'theme']), options: options.join('|'), belong }
  }
  return cellarQuestionFromRow(row)
}

/** Mad Libs: a story template with `{token}` blanks. An optional `blanks` column may
 *  carry a JSON array of `{id,label}` (the built-in pool keeps its rich labels that
 *  way); otherwise the game derives blanks from the template tokens. Skips a template
 *  with no blank. */
export function storyFromRow(row: Record<string, string | number>): { template: string; blanks: string } | null {
  const template = pick(row, ['template', 'story', 'sentence', 'text']) || texts(row)[0] || ''
  if (!template || !/\{[^}]+\}/.test(template)) return null
  return { template, blanks: pick(row, ['blanks']) }
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
