/**
 * Blocks and compositions, the easy path for authoring games.
 *
 * A **block** is a standalone round kind (Guess, Rate, Poll, …): the unit you
 * register, like a node in Node-RED. It declares only what is unique to that
 * kind, a content schema, a phone input view, a big-screen display view, a
 * results contribution, and optional answer-withholding. It knows nothing about
 * any game.
 *
 * A **game** is a composition: a manifest plus an ordered list of round
 * instances `{ block, content }`. The generic renderer mounts the right block
 * per round and merges their results. So Guess = [guess], VoteBox = [guess,
 * rate]. The composite is built from blocks, never the other way around.
 *
 * A game may also override the rendered components for a fully custom
 * experience; that escape hatch keeps the powerful path open.
 */
import type { Component } from 'vue'
import type { z } from 'zod'
import type { GameManifest } from './manifest'
import type { GameComponents, ScorePlayer } from './plugin'
import type { Distribution, LeaderboardEntry, StatItem } from './results'
import type { ThemeTokens } from '@doot-games/themes'

/** What a block's `aggregate` receives: every round of its kind, plus inputs. */
export interface BlockResultsContext<Content = unknown, Input = unknown> {
  rounds: Array<{ index: number; content: Content }>
  inputsFor: (index: number) => Map<string, Input>
  /** The answer key for a round (the host holds these privately). */
  answerFor: (index: number) => unknown
  players: ScorePlayer[]
}

/** One source ("make") round a derived block consumes. `inputs` is cross-block
 *  (the source block's input type), so it is `unknown`; `render` turns one of
 *  those submissions into a votable string via the source block's `toVoteText`
 *  (e.g. a Quip's text, or a Mad Lib's filled-in story). */
export interface DeriveSource {
  index: number
  content: unknown
  inputs: Map<string, unknown>
  render: (input: unknown) => string
  /** The source round's withheld answer key, if it has one (a runtime-derived or
   *  assigned key like the faker round's `{ fakerPid, word }`, or a static
   *  `answerOf`). Lets a judge round learn a hidden fact about its make round (who
   *  the imposter is) without it ever reaching the relay. Undefined for most. */
  answer?: unknown
}

/**
 * What a derived block's `derive` receives: the source rounds it consumes (their
 * authored content, every player's input, and a renderer), the roster, and a
 * seeded shuffle so anonymized options are ordered deterministically (reconnect-safe).
 */
export interface DeriveContext<Content = unknown> {
  /** This round's own authored content (mode, timer, default prompt). */
  content: Content
  sources: DeriveSource[]
  players: ScorePlayer[]
  /** Deterministic shuffle (seeded by the room) so all clients agree on order. */
  shuffle: <T>(items: T[]) => T[]
}

/**
 * What a derived block's `derive` returns: the anonymized content to publish to
 * the relay, and the withheld answer key (e.g. the option→author map) revealed
 * only at reveal. Mirrors the static `redactContent`/`answerOf` split.
 */
export interface DerivedContent<Content = unknown> {
  publish: Content
  answer?: unknown
}

/**
 * What a hidden-role block's `assignContent` receives: this round's authored
 * content, the current roster, and a seeded shuffle so the role assignment (e.g.
 * which player is the imposter) is deterministic and reconnect-safe.
 *
 * `sources` mirrors `DeriveContext`: the earlier rounds this round consumes
 * (their inputs, keyed by player id, plus a renderer), wired by the composition
 * (`RoundInstance.from`, default: the previous round). It lets per-player content
 * be derived from a PRIOR round's inputs, not just the roster, which is what a
 * per-player chain (Gartic Phone) needs: round N hands each player another
 * player's round N-1 output. Empty for the hidden-role case (faker), which only
 * reads the roster.
 */
export interface AssignContext<Content = unknown> {
  content: Content
  players: ScorePlayer[]
  shuffle: <T>(items: T[]) => T[]
  sources: DeriveSource[]
}

/**
 * What `assignContent` returns: a SECRET per-player content map (pid -> that
 * player's view, published only to their private address) plus an optional
 * withheld answer key (e.g. who the imposter is), revealed at reveal.
 */
export interface AssignedContent<Content = unknown> {
  perPlayer: Record<string, Content>
  answer?: unknown
}

/** What a block's `revealSummary` receives to build a public per-round payload. */
export interface RevealContext<Content = unknown, Input = unknown> {
  content: Content
  inputs: Map<string, Input>
  answer: unknown
  players: ScorePlayer[]
}

/** A block's contribution to the results page; fragments are merged across blocks. */
export interface ResultsFragment {
  headline?: string
  leaderboard?: LeaderboardEntry[]
  awards?: Array<{ label: string; subject: string; value?: string | number }>
  distributions?: Distribution[]
  stats?: StatItem[]
  /** Arbitrary extra payload a game's CUSTOM Results view understands but the
   *  generic widgets don't (e.g. a chain game's unspooled threads). The generic
   *  GameResults ignores it; `scoreGame` passes the first non-undefined `recap`
   *  through to the published `StandardResults.recap`. */
  recap?: unknown
}

export interface RoundBlock<Content = unknown, Input = unknown> {
  kind: string
  name: string
  /** An informational block with NO player input (a slide, a title card). The
   *  renderer shows its HostDisplay full-bleed on the big screen and mirrors it on
   *  phones with no submit button, and the host advances it with a single button
   *  instead of the open/lock/reveal beat. Such a block has no aggregate/answer. */
  display?: boolean
  /** One round's content. The editor auto-forms from this (image fields get
   *  an uploader with preview). */
  contentSchema: z.ZodType<Content>
  defaultContent: () => Content
  defaultTimer?: number | null
  /** Seconds before voting auto-locks for a round of this content, or null. */
  timerOf?: (content: Content) => number | null

  /** The initial (empty) player input for a round of this content. */
  emptyInput: (content: Content) => Input
  /** Whether the input is complete enough to submit (default: always). */
  isComplete?: (content: Content, input: Input) => boolean
  /** Phone input. Props: `{ content, modelValue, disabled }`; emits `update:modelValue`. */
  PlayerInput: Component
  /** Big screen. Props: `{ content, inputs: Map, state, answer }`. */
  HostDisplay: Component

  /** Aggregate this kind's rounds into a results fragment. Pure and testable. */
  aggregate?: (ctx: BlockResultsContext<Content, Input>) => ResultsFragment

  /** Strip answers from content before it is published to the relay. Must
   *  deep-copy anything it edits, the host keeps the original for scoring. */
  redactContent?: (content: Content) => Content
  /** The answer key for a round, revealed only at that round's reveal. */
  answerOf?: (content: Content) => unknown

  /** Optional custom editor for one round; auto-generated from the schema otherwise. */
  Editor?: Component

  // ---- two-phase (make -> judge) -------------------------------------------

  /**
   * Build this round's content at runtime from earlier rounds' inputs (the
   * two-phase pattern: collect submissions, then vote on the anonymized,
   * shuffled set). Pure and host-only. Returns the anonymized content to publish
   * plus the withheld answer key. The source rounds are wired by the composition
   * (`RoundInstance.from`, default: the previous round). Absent for static rounds.
   */
  derive?: (ctx: DeriveContext<Content>) => DerivedContent<Content>

  /**
   * Hidden-role pattern: build SECRET per-player content for this round from the
   * roster (e.g. one player is the imposter and gets a different prompt). Pure and
   * host-only. Returns a pid -> content map (each delivered only to that player's
   * private address) plus an optional withheld answer (who the imposter is). The
   * authored content should `redactContent` anything the secret must hide from the
   * public config (e.g. the secret word), since assignContent delivers it privately.
   */
  assignContent?: (ctx: AssignContext<Content>) => AssignedContent<Content>

  /** Content keys this block's `derive` produces at runtime from the source
   *  round (e.g. the vote block's `options`, the split block's `scenarios`).
   *  The editor hides these fields and explains they are built automatically
   *  from the previous round's answers, instead of asking the author to fill in
   *  placeholder ids and empty text. Only meaningful alongside `derive`. */
  derivedFields?: string[]

  /** How this block's submission renders to a votable string when a later
   *  derived round consumes it (e.g. a Mad Lib fills its template). Defaults to
   *  the input's `text` field. Pure. */
  toVoteText?: (content: Content, input: Input) => string

  /**
   * A public per-round reveal payload (vote tallies, the round winner) the host
   * publishes at reveal so phones can show personal feedback rather than only the
   * big screen. Pure. The shape is the block's own; its `PlayerReveal` reads it.
   */
  revealSummary?: (ctx: RevealContext<Content, Input>) => unknown

  /** Phone view at reveal. Props: `{ content, myInput, reveal }` (reveal = the
   *  block's `revealSummary` payload). Falls back to a generic notice if absent. */
  PlayerReveal?: Component

  /** RESERVED (declared, not yet wired by the renderer; see docs/flagship-games.md
   *  §3.2). Per-player prompt assignment: 'shared' (default, everyone sees the
   *  same content) or 'per-player' (each player gets a deterministic slice via
   *  `promptFor`, reconnect-safe because it is keyed by player id). The first
   *  game that needs Quiplash-style per-player prompts will wire this. */
  assignment?: 'shared' | 'per-player'
  /** RESERVED (see `assignment`). Derive one player's view of the content;
   *  `seed` is stable for the room. Pure. */
  promptFor?: (content: Content, pid: string, seed: string) => Content

  /** Optional: makes this block usable as a TYPED deck (a whole round per drawn row),
   *  for content with array/nested shapes (options, blanks) that field bindings can't
   *  express. `fromRow` assembles full content from one deck row + the round's shared
   *  settings; `answerField` names the produced answer key so redaction can find the
   *  secret column. Pure. Blocks without it still support field bindings (mode 1).
   *  See docs/content-decks-plan.md. (Wired in a later slice.) */
  pool?: BlockPool<Content>
}

/** The typed-deck descriptor for a block (mode 2). */
export interface BlockPool<Content> {
  /** Assemble full Content from one deck row + the round's shared settings. */
  fromRow: (row: Record<string, string | number>, settings: Partial<Content>) => Content
  /** Which produced field is the answer key (so deck redaction strips its column). */
  answerField?: keyof Content
  /** A sample row, surfaced in the editor + the MCP format guide. */
  sample?: Record<string, string>
}

/** A block with its generics erased, for storage in a game's block list. */
// biome-ignore lint/suspicious/noExplicitAny: registry storage erases generics
export type AnyBlock = RoundBlock<any, any>

// ── Content decks (data-driven games) ───────────────────────────────────────
// A deck is a named-column table of rows ("cards"); a round can DRAW rows from it
// and either bind individual fields to columns (mode 1) or build its whole content
// from a row via the block's `pool` descriptor (mode 2). See docs/content-decks-plan.md.

/** One column of a deck. `type` drives import inference + the binding UI (an image
 *  field only binds to an `image` column). */
export interface DeckColumn {
  key: string
  label: string
  type: 'text' | 'image' | 'number'
}

/** A deck: named columns + rows. Each row is one correlated set ("card"): every
 *  field bound to this deck in a round reads the SAME drawn row. `kind` is the typed
 *  descriptor (e.g. 'guess' -> a "Quiz Deck"); undefined = a generic deck. */
export interface Deck {
  columns: DeckColumn[]
  rows: Array<Record<string, string | number>>
  kind?: string
}

/** A round field bound to a deck column (`deck` is a config-local id). */
export interface DeckRef {
  deck: string
  column: string
}

/** How a game config carries a deck: a frozen inline snapshot, or a reference to a
 *  durable library deck (resolved to inline at serve time, so the engine resolver
 *  only ever sees inline decks). */
export type DeckUse = { inline: Deck } | { ref: string; version?: number }

/** The typed descriptor of a library deck: `generic` (arbitrary columns), or a shape
 *  hint that maps to a game's content pool — `prompt` (one text column), `quiz`
 *  (question/answer), `card`. The durable library + the deck editor share this union. */
export const DECK_KINDS = ['generic', 'quiz', 'prompt', 'card'] as const
export type DeckKind = (typeof DECK_KINDS)[number]

/** One authored round in a composition: which block, and its content. */
export interface RoundInstance {
  block: string
  content: unknown
  /** For a derived (two-phase) round: the source round indices whose inputs feed
   *  this round's `derive`. Defaults to `[index - 1]` (the immediately prior
   *  round). Ignored by static rounds. */
  from?: number[]
  /** Deck-backed (all optional, additive). `draw` emits N instances, each a distinct
   *  drawn row (default 1). `bindings` map scalar content field paths to deck columns
   *  (mode 1). `pool` builds the whole content from a row via the block's `pool`
   *  descriptor (mode 2). A round with none of these resolves to itself unchanged. */
  draw?: number
  bindings?: Record<string, DeckRef>
  pool?: { deck: string }
  /** Play-time variable: fill a field of this round at runtime from a prior `collect`
   *  round's shares (the collected media/text becomes a variable for a later round).
   *  `from` is the source collect round (default the previous round); `field` is the
   *  content field to fill (e.g. `image`); `value` is which part of a share to use
   *  (default `media`); `pick` chooses one share (`random`, seeded + deterministic, or
   *  `first`). Resolved by `buildDeriveContent` at round-advance, so it never touches
   *  the load-time deck resolver. */
  fromShares?: {
    from?: number
    field: string
    value?: 'media' | 'text'
    pick?: 'random' | 'first'
  }
}

/** The durable game definition a composition produces. */
export interface GameComposition {
  title: string
  rounds: RoundInstance[]
  /** Config-local decks keyed by id, referenced by rounds' `bindings`/`pool`. Each
   *  is an inline snapshot or a library reference; resolved before play. Optional. */
  decks?: Record<string, DeckUse>
}

/**
 * Declares that a pool-driven game's content pool is deck-feedable: the built-in pool
 * (as `defaultRows`) plus how a creator deck maps to it. When a creator attaches a
 * matching deck, the host passes its rows to `buildConfig` (via `opts.rows`) so the
 * game plays their content; with no deck attached, `buildConfig` uses `defaultRows`,
 * i.e. exactly today's behavior. See docs/decks-roadmap.md.
 */
export interface ContentPool<Row extends Record<string, string | number> = Record<string, string | number>> {
  /** The built-in pool, as rows — what plays when no creator deck is attached. */
  defaultRows: Row[]
  /** The deck `kind` a creator deck must be to feed this game (e.g. 'prompt'). */
  deckKind: DeckKind
  /** Map one deck row to one pool row; return null to skip an unusable row. */
  fromRow: (row: Record<string, string | number>) => Row | null
  /** How an attached deck combines with the built-in pool. Default 'replace'. */
  merge?: 'replace' | 'append'
  /** Deck COLUMN names that carry an answer/secret (e.g. 'truth', 'answer', 'correct',
   *  'word'). When an attached pool deck is served to a non-owner, these columns are
   *  nulled so a typed deck never leaks answers (invariant #3). A prompt pool has none. */
  answerColumns?: string[]
  /** Column groups a creator deck MUST satisfy to feed this game; each inner array is the
   *  set of accepted synonyms for one needed column (e.g. `[['question','prompt'],['options']]`).
   *  The remix picker hides a deck that doesn't match, so a quiz deck of the wrong shape is
   *  never offered (it would silently fall back to the built-in pool). Omit for a single
   *  text-column pool, where any prompt deck works. */
  requires?: string[][]
}

export interface GamePlugin {
  manifest: GameManifest
  /** The blocks this game composes. */
  blocks: AnyBlock[]
  /** The seed composition a creator starts from. */
  defaultConfig: GameComposition
  themeDefaults?: Partial<ThemeTokens>
  /** Optional full-custom override of the rendered views. */
  components?: Partial<GameComponents>
  /**
   * Build a fresh composition for one play by sampling from a large content pool
   * (replayability: no two rooms get the same prompts). `seed` is the room code,
   * so a room is internally consistent across reconnects but differs from other
   * rooms. The host prefers this over `defaultConfig` when present. `opts.rounds`
   * (when set) is the host-chosen number of rounds/items to draw; `opts.rows` (when
   * set) overrides the built-in pool with a creator deck's rows (see `contentPool`).
   */
  buildConfig?: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => GameComposition
  /**
   * Opt-in: this game's pool is deck-feedable. When present (and a matching deck is
   * attached to the saved game), the host feeds the deck's rows into `buildConfig`.
   */
  contentPool?: ContentPool
  /**
   * If set (and `buildConfig` exists), the host can pick how many rounds/items to
   * play from the lobby (a differentiator over fixed-length party games). `label`
   * names the unit (e.g. "Prompts", "Stories", "Dilemmas").
   */
  roundOptions?: { min: number; max: number; default: number; label: string }
}

export function defineBlock<Content, Input>(
  block: RoundBlock<Content, Input>,
): RoundBlock<Content, Input> {
  return block
}

export function defineGame(plugin: GamePlugin): GamePlugin {
  return plugin
}
