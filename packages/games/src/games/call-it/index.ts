/**
 * Call It, a host-resolved live-prediction game and the companion to Bingo for a room
 * with a screen up front. The host poses a quick prediction ("Do they score this drive?"
 * Yes / No), the room locks a pick, and when it actually happens the host taps the real
 * outcome; everyone who called it right scores, and the board carries across as many
 * calls as the host wants. Perfect as a second screen for a bar with a game already on.
 *
 * This is a CUSTOM-FLOW game: it ships a custom Host + Player that drive every call over
 * the relay's custom `/x/` channels (the proven Truth or Share transport), with the
 * parked `callit` round giving the engine a round to sit on. All scoring is the pure,
 * tested logic in `logic.ts`. Nothing is withheld (the outcome happens in the real world,
 * it is not stored in the config).
 */
import { defineGame } from '@doot-games/sdk'
import { callitBlock } from '../../blocks/callit/block'
import { EXAMPLE_PROMPTS, OPTION_SETS } from './logic'
import CallItHost from './Host.vue'
import CallItPlayer from './Player.vue'

const content = { examples: EXAMPLE_PROMPTS, optionSets: OPTION_SETS }

export const callIt = defineGame({
  manifest: {
    id: 'call-it',
    name: 'Call It',
    version: '0.1.0',
    description: 'Live predictions for a room with a screen on. The host calls it, you pick, and calling it right scores.',
    author: 'Doot',
    capabilities: [],
    minPlayers: 2,
    flagship: true,
  },
  blocks: [callitBlock],
  components: { Host: CallItHost, Player: CallItPlayer },
  defaultConfig: { title: 'Call It', rounds: [{ block: 'callit', content }] },
  buildConfig: () => ({ title: 'Call It', rounds: [{ block: 'callit', content }] }),
})
