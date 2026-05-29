/**
 * The game plugin contract — the single most important design decision in
 * Doot, because it is what lets new games appear without touching the platform.
 * A game type is a small package that satisfies this interface. See PRD §8.1.
 */
import type { ThemeTokens } from '@doot-games/themes'
import type { Component } from 'vue'
import type { z } from 'zod'
import type { GameManifest } from './manifest'
import type { Results } from './results'
import type { RoundSpec } from './rounds'

/** A player as scoring sees them (only those eligible/present are passed in). */
export interface ScorePlayer {
  id: string
  name: string
  joinedAtIndex: number
}

/** Everything a `score()` function needs. Pure: no relay, no clock, no I/O. */
export interface ScoreContext<Config = unknown, Input = unknown> {
  config: Config
  rounds: RoundSpec[]
  players: ScorePlayer[]
  /** All submissions for a round, keyed by player id. */
  inputsFor: (roundIndex: number) => Map<string, Input>
  /** Answer key per round index (the host holds these privately). */
  answerKeys: Record<number, unknown>
}

export interface GameComponents {
  /** Big screen; switches on round state. */
  Host: Component
  /** Phone input surface. */
  Player: Component
  /** The animated results page. */
  Results: Component
  /** Optional; auto-generated from `configSchema` when omitted. */
  Editor?: Component
  /** Optional lobby customization. */
  Lobby?: Component
}

export interface GamePlugin<
  Config = unknown,
  Input = unknown,
  R extends Results = Results,
> {
  manifest: GameManifest
  /** Shape of the game definition the editor produces. */
  configSchema: z.ZodType<Config>
  /** Seed content shown for a new game of this type. */
  defaultConfig: Config
  /** Derive the round sequence from config. */
  rounds: (config: Config) => RoundSpec[]
  /** Aggregate inputs into results. Pure and testable. */
  score: (ctx: ScoreContext<Config, Input>) => R
  components: GameComponents
  /** Theme tokens this game looks best with; the creator can keep or replace. */
  themeDefaults?: Partial<ThemeTokens>
  /**
   * Strip answer keys from config before it is published to the relay, so a
   * spectator reading the relay cannot see answers early. Omit if the game has
   * no withheld answers. The engine enforces the timing (it publishes each
   * round's answer only at reveal); this declares the shape-specific stripping.
   */
  redactConfig?: (config: Config) => Config
  /** Extract the answer key per round index (withheld until that round's reveal). */
  answerKeys?: (config: Config) => Record<number, unknown>
}

/** Identity helper that preserves a plugin's generic types. */
export function definePlugin<Config, Input, R extends Results>(
  plugin: GamePlugin<Config, Input, R>,
): GamePlugin<Config, Input, R> {
  return plugin
}

/** A registry entry pairs a loaded plugin with its source. */
export interface PluginRegistration {
  plugin: GamePlugin
  source: 'builtin' | 'url'
  sourceUrl?: string
}
