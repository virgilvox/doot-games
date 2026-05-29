/**
 * Guess — a single-type game built on the `multiple-choice` primitive. Show a
 * prompt or image, give options, one is correct. The classic
 * guess-the-character / who-said-it round. Shares the deck engine and views
 * with Rate and the VoteBox composite.
 */
import { definePlugin } from '@doot-games/sdk'
import { type VoteBoxConfig, type VoteBoxInput, voteBoxConfigSchema } from '../votebox/config'
import Host from '../votebox/Host.vue'
import Player from '../votebox/Player.vue'
import Results from '../votebox/Results.vue'
import { voteBoxAnswerKeys, voteBoxRedactConfig, voteBoxRounds } from '../votebox/rounds'
import { type VoteBoxResults, voteBoxScore } from '../votebox/score'

function guessDefaultConfig(): VoteBoxConfig {
  const slides = ['Round One', 'Round Two', 'Round Three'].map((subject, i) => ({
    id: `guess-${i}`,
    type: 'guess' as const,
    subject,
    prompt: 'Who is this?',
    image: '',
    timer: 20,
    options: [{ label: 'Option A' }, { label: 'Option B' }, { label: 'Option C' }, { label: 'Option D' }],
    correct: 0,
  }))
  return { title: 'Guessing Game', ratingScale: { min: 1, max: 10, step: 1 }, categories: [], slides }
}

export const guess = definePlugin<VoteBoxConfig, VoteBoxInput, VoteBoxResults>({
  manifest: {
    id: 'guess',
    name: 'Guess',
    version: '0.1.0',
    description: 'Show a prompt or image, give multiple choices, one is correct.',
    author: 'Doot',
    capabilities: ['timer', 'images'],
    minPlayers: 1,
  },
  configSchema: voteBoxConfigSchema,
  defaultConfig: guessDefaultConfig(),
  rounds: voteBoxRounds,
  score: voteBoxScore,
  components: { Host, Player, Results },
  redactConfig: voteBoxRedactConfig,
  answerKeys: voteBoxAnswerKeys,
})

export default guess
