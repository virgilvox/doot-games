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
 */
export interface AssignContext<Content = unknown> {
  content: Content
  players: ScorePlayer[]
  shuffle: <T>(items: T[]) => T[]
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
}

export interface RoundBlock<Content = unknown, Input = unknown> {
  kind: string
  name: string
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
}

/** A block with its generics erased, for storage in a game's block list. */
// biome-ignore lint/suspicious/noExplicitAny: registry storage erases generics
export type AnyBlock = RoundBlock<any, any>

/** One authored round in a composition: which block, and its content. */
export interface RoundInstance {
  block: string
  content: unknown
  /** For a derived (two-phase) round: the source round indices whose inputs feed
   *  this round's `derive`. Defaults to `[index - 1]` (the immediately prior
   *  round). Ignored by static rounds. */
  from?: number[]
}

/** The durable game definition a composition produces. */
export interface GameComposition {
  title: string
  rounds: RoundInstance[]
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
   * (when set) is the host-chosen number of rounds/items to draw.
   */
  buildConfig?: (seed: string, opts?: { rounds?: number }) => GameComposition
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
