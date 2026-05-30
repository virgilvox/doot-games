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
}

/** A block with its generics erased, for storage in a game's block list. */
// biome-ignore lint/suspicious/noExplicitAny: registry storage erases generics
export type AnyBlock = RoundBlock<any, any>

/** One authored round in a composition: which block, and its content. */
export interface RoundInstance {
  block: string
  content: unknown
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
}

export function defineBlock<Content, Input>(
  block: RoundBlock<Content, Input>,
): RoundBlock<Content, Input> {
  return block
}

export function defineGame(plugin: GamePlugin): GamePlugin {
  return plugin
}
