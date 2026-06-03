/**
 * The first-party plugin registry. Discrete game types lead; VoteBox is the
 * composite. All are block compositions, no game depends on another.
 */
import type { GamePlugin } from '@doot-games/sdk'
import { backronym } from './games/backronym'
import { ballpark } from './games/ballpark'
import { buzzer } from './games/buzzer'
import { circuitCypher } from './games/circuit-cypher'
import { custom } from './games/custom'
import { draw } from './games/draw'
import { faker } from './games/faker'
import { fibFinder } from './games/fib-finder'
import { guess } from './games/guess'
import { hivemind } from './games/hivemind'
import { madLibs } from './games/mad-libs'
import { mostLikely } from './games/most-likely'
import { openMic } from './games/open-mic'
import { poll } from './games/poll'
import { quipClash } from './games/quip-clash'
import { quizOrDie } from './games/quiz-or-die'
import { rank } from './games/rank'
import { rate } from './games/rate'
import { sketchSpot } from './games/sketch-spot'
import { splitRoom } from './games/split-room'
import { truthOrShare } from './games/truth-or-share'
import { voteBox } from './games/votebox'
import { whatYouDidntKnow } from './games/what-you-didnt-know'

export const builtinPlugins: GamePlugin[] = [
  guess,
  rate,
  poll,
  rank,
  draw,
  buzzer,
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
  faker,
  truthOrShare,
  quizOrDie,
  custom,
]

const byId = new Map<string, GamePlugin>(builtinPlugins.map((p) => [p.manifest.id, p]))

export function getPlugin(id: string): GamePlugin | undefined {
  return byId.get(id)
}

export function listPlugins(): GamePlugin[] {
  return [...byId.values()]
}
