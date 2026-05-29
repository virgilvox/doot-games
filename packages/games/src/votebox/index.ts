/**
 * VoteBox — the reference plugin. Alternating guess and rate rounds: guess uses
 * multiple-choice with optional images and a timer; rate uses a configurable
 * scale across one or more categories. Results show a leaderboard, a top-rated
 * award per category, and the crowd favorite. See PRD section 20.
 */
import { definePlugin } from '@doot-games/sdk'
import {
  type VoteBoxConfig,
  type VoteBoxInput,
  defaultVoteBoxConfig,
  voteBoxConfigSchema,
} from './config'
import Host from './Host.vue'
import Player from './Player.vue'
import Results from './Results.vue'
import { voteBoxAnswerKeys, voteBoxRedactConfig, voteBoxRounds } from './rounds'
import { type VoteBoxResults, voteBoxScore } from './score'

export const voteBox = definePlugin<VoteBoxConfig, VoteBoxInput, VoteBoxResults>({
  manifest: {
    id: 'votebox',
    name: 'VoteBox',
    version: '0.1.0',
    description: 'Guess characters and rate them. The party classic — and Doot’s worked example.',
    author: 'Doot',
    capabilities: ['timer', 'images'],
    minPlayers: 1,
  },
  configSchema: voteBoxConfigSchema,
  defaultConfig: defaultVoteBoxConfig(),
  rounds: voteBoxRounds,
  score: voteBoxScore,
  components: { Host, Player, Results },
  redactConfig: voteBoxRedactConfig,
  answerKeys: voteBoxAnswerKeys,
})

export * from './config'
export * from './rounds'
export * from './score'
export default voteBox
