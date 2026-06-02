/**
 * The first-party plugin registry. Discrete game types lead; VoteBox is the
 * composite. All are block compositions, no game depends on another.
 */
import type { GamePlugin } from '@doot-games/sdk'
import { backronym } from './games/backronym'
import { ballpark } from './games/ballpark'
import { circuitCypher } from './games/circuit-cypher'
import { custom } from './games/custom'
import { draw } from './games/draw'
import { fibFinder } from './games/fibfinder'
import { guess } from './games/guess'
import { hivemind } from './games/hivemind'
import { madLibs } from './games/madlibs'
import { mostLikely } from './games/mostlikely'
import { openMic } from './games/openmic'
import { poll } from './games/poll'
import { quipClash } from './games/quipclash'
import { rank } from './games/rank'
import { rate } from './games/rate'
import { sketchSpot } from './games/sketchspot'
import { splitRoom } from './games/splitroom'
import { voteBox } from './games/votebox'
import { whatYouDidntKnow } from './games/what-you-didnt-know'

export const builtinPlugins: GamePlugin[] = [
  guess,
  rate,
  poll,
  rank,
  draw,
  voteBox,
  quipClash,
  madLibs,
  splitRoom,
  fibFinder,
  sketchSpot,
  circuitCypher,
  whatYouDidntKnow,
  backronym,
  openMic,
  hivemind,
  mostLikely,
  ballpark,
  custom,
]

const byId = new Map<string, GamePlugin>(builtinPlugins.map((p) => [p.manifest.id, p]))

export function getPlugin(id: string): GamePlugin | undefined {
  return byId.get(id)
}

export function listPlugins(): GamePlugin[] {
  return [...byId.values()]
}
