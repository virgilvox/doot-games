/**
 * The first-party plugin registry. Discrete game types lead; VoteBox is the
 * composite. All are block compositions — no game depends on another.
 */
import type { GamePlugin } from '@doot-games/sdk'
import { draw } from './games/draw'
import { guess } from './games/guess'
import { poll } from './games/poll'
import { rank } from './games/rank'
import { rate } from './games/rate'
import { voteBox } from './games/votebox'

export const builtinPlugins: GamePlugin[] = [guess, rate, poll, rank, draw, voteBox]

const byId = new Map<string, GamePlugin>(builtinPlugins.map((p) => [p.manifest.id, p]))

export function getPlugin(id: string): GamePlugin | undefined {
  return byId.get(id)
}

export function listPlugins(): GamePlugin[] {
  return [...byId.values()]
}
