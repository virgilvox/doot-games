/**
 * Custom - a game type that allows every block, so you can mix any combination
 * of rounds. It is also the natural home for the markdown importer: paste an
 * LLM-written spec (see docs/markdown-games.md) and the editor builds the whole
 * composition at once.
 */
import { defineGame } from '@doot-games/sdk'
import { accuseBlock } from '../../blocks/accuse/block'
import { ballparkBlock } from '../../blocks/ballpark/block'
import { buzzerBlock } from '../../blocks/buzzer/block'
import { collectBlock } from '../../blocks/collect/block'
import { drawBlock } from '../../blocks/draw/block'
import { drawVoteBlock } from '../../blocks/drawvote/block'
import { fakerBlock } from '../../blocks/faker/block'
import { fibBlock } from '../../blocks/fibvote/block'
import { fillBlock } from '../../blocks/fill/block'
import { guessBlock } from '../../blocks/guess/block'
import { hivemindBlock } from '../../blocks/hivemind/block'
import { mostLikelyBlock } from '../../blocks/mostlikely/block'
import { photoVoteBlock } from '../../blocks/photovote/block'
import { pollBlock } from '../../blocks/poll/block'
import { quipBlock } from '../../blocks/quip/block'
import { rankBlock } from '../../blocks/rank/block'
import { rateBlock } from '../../blocks/rate/block'
import { slideBlock } from '../../blocks/slide/block'
import { splitBlock } from '../../blocks/split/block'
import { titleBlock } from '../../blocks/title/block'
import { voteBlock } from '../../blocks/vote/block'

export const custom = defineGame({
  manifest: {
    id: 'custom',
    name: 'Custom',
    version: '0.1.0',
    description: 'Mix any blocks into one game, or paste a markdown spec to build a whole game at once.',
    author: 'Doot',
    capabilities: ['timer', 'drawing'],
    minPlayers: 1,
  },
  // Custom composes every block so the editor can build any first-party pattern
  // by hand. The make blocks (quip/fill/faker) and the derived judge blocks
  // (vote/split/fibvote/drawvote/accuse) are the two halves of the two-phase
  // "recipes" the editor's Add panel inserts as a pair; a judge block is never
  // offered alone (the editor hides anything with a `derive`), and a make-only
  // block is offered only inside a recipe. buzzer is a standalone trivia block.
  blocks: [
    titleBlock,
    slideBlock,
    guessBlock,
    rateBlock,
    pollBlock,
    rankBlock,
    drawBlock,
    drawVoteBlock,
    hivemindBlock,
    mostLikelyBlock,
    ballparkBlock,
    buzzerBlock,
    collectBlock,
    photoVoteBlock,
    quipBlock,
    voteBlock,
    fillBlock,
    splitBlock,
    fibBlock,
    fakerBlock,
    accuseBlock,
  ],
  defaultConfig: {
    title: 'Custom Game',
    rounds: [
      { block: 'poll', content: pollBlock.defaultContent() },
      { block: 'guess', content: guessBlock.defaultContent() },
    ],
  },
})
