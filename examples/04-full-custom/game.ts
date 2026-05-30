/**
 * Way 4: Full custom (override the rendered views).
 *
 * When the block model doesn't fit, a game can override Host/Player/Results with
 * its own components. The engine STILL handles the relay, the room, the
 * phase/round state machine, late joiners, and reconnect, your views just read
 * reactive state and call actions via `injectDootRoom()` from
 * `@doot-games/engine/vue`. See the three .vue files in this folder.
 *
 * This "Tap Battle" is a one-round reaction game: when voting opens, everyone taps
 * as fast as they can; the host ends it and the most taps wins. It uses no blocks.
 */
import { defineGame } from '@doot-games/sdk'
import TapHost from './TapHost.vue'
import TapPlayer from './TapPlayer.vue'
import TapResults from './TapResults.vue'

export const tapBattle = defineGame({
  manifest: {
    id: 'tap-battle',
    name: 'Tap Battle',
    version: '0.1.0',
    description: 'Tap as fast as you can. Most taps wins. A full-custom example.',
    author: 'you',
    capabilities: ['timer'],
    minPlayers: 1,
  },
  // No blocks: this game owns its own views.
  blocks: [],
  // A full-custom game still needs a (possibly trivial) composition; the engine
  // uses round timing from it. One round here.
  defaultConfig: { title: 'Tap Battle', rounds: [{ block: 'custom', content: { timer: 10 } }] },
  // The escape hatch: provide any of Host / Player / Results.
  components: { Host: TapHost, Player: TapPlayer, Results: TapResults },
})
