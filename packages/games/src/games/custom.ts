/**
 * Custom - a game type that allows every block, so you can mix any combination
 * of rounds. It is also the natural home for the markdown importer: paste an
 * LLM-written spec (see docs/markdown-games.md) and the editor builds the whole
 * composition at once.
 */
import { defineGame } from '@doot-games/sdk'
import { drawBlock } from '../blocks/draw/block'
import { drawVoteBlock } from '../blocks/drawvote/block'
import { guessBlock } from '../blocks/guess/block'
import { pollBlock } from '../blocks/poll/block'
import { rankBlock } from '../blocks/rank/block'
import { rateBlock } from '../blocks/rate/block'

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
  // drawvote is here so a markdown/MCP draw-then-vote game (a `## draw` round
  // with `vote: true` expands to draw + drawvote) can host and edit as a Custom
  // game. It is derived (built from the prior draw round), so the editor's
  // add-round menu hides it; it is only created by the markdown expansion.
  blocks: [guessBlock, rateBlock, pollBlock, rankBlock, drawBlock, drawVoteBlock],
  defaultConfig: {
    title: 'Custom Game',
    rounds: [
      { block: 'poll', content: pollBlock.defaultContent() },
      { block: 'guess', content: guessBlock.defaultContent() },
    ],
  },
})
