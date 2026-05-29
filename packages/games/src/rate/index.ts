/**
 * Rate — a single-type game built on the `rating` primitive. Rate each subject
 * on categories you define, on any scale; the room crowns a top pick per
 * category. Shares the deck engine and views with Guess and the VoteBox composite.
 */
import { definePlugin } from '@doot-games/sdk'
import { type VoteBoxConfig, type VoteBoxInput, voteBoxConfigSchema } from '../votebox/config'
import Host from '../votebox/Host.vue'
import Player from '../votebox/Player.vue'
import Results from '../votebox/Results.vue'
import { voteBoxAnswerKeys, voteBoxRedactConfig, voteBoxRounds } from '../votebox/rounds'
import { type VoteBoxResults, voteBoxScore } from '../votebox/score'

function rateDefaultConfig(): VoteBoxConfig {
  const categories = [
    { id: 'craft', label: 'Craft' },
    { id: 'accuracy', label: 'Accuracy' },
    { id: 'presence', label: 'Stage Presence' },
  ]
  const slides = ['Entry One', 'Entry Two', 'Entry Three'].map((subject, i) => ({
    id: `rate-${i}`,
    type: 'rate' as const,
    subject,
    prompt: `Rate ${subject}`,
    image: '',
    timer: null,
    categories: categories.map((c) => c.id),
  }))
  return { title: 'Rate-Off', ratingScale: { min: 1, max: 10, step: 1 }, categories, slides }
}

export const rate = definePlugin<VoteBoxConfig, VoteBoxInput, VoteBoxResults>({
  manifest: {
    id: 'rate',
    name: 'Rate',
    version: '0.1.0',
    description: 'Rate each subject on categories you define, on any scale. Awards a top pick per category.',
    author: 'Doot',
    capabilities: ['untimed', 'images'],
    minPlayers: 1,
  },
  configSchema: voteBoxConfigSchema,
  defaultConfig: rateDefaultConfig(),
  rounds: voteBoxRounds,
  score: voteBoxScore,
  components: { Host, Player, Results },
  redactConfig: voteBoxRedactConfig,
  answerKeys: voteBoxAnswerKeys,
})

export default rate
