/**
 * The first-party plugin registry. Built-in plugins live here, one per game,
 * and load in the main app context (fully trusted because they ship in the
 * repo). External, sandboxed plugins are registered separately (PRD section 9).
 */
import type { GamePlugin } from '@doot-games/sdk'
import { guess } from './guess'
import { rate } from './rate'
import { voteBox } from './votebox'

/**
 * All built-in plugins, type-erased for registry storage. Discrete game types
 * (each built on one round primitive) lead; VoteBox is the composite that
 * combines Guess + Rate. More types (Draw, Poll, Rank, Buzz) map to existing
 * SDK primitives and are on the roadmap.
 */
export const builtinPlugins: GamePlugin[] = [
  guess as unknown as GamePlugin,
  rate as unknown as GamePlugin,
  voteBox as unknown as GamePlugin,
]

const byId = new Map<string, GamePlugin>(builtinPlugins.map((p) => [p.manifest.id, p]))

export function getPlugin(id: string): GamePlugin | undefined {
  return byId.get(id)
}

export function listPlugins(): GamePlugin[] {
  return [...byId.values()]
}
