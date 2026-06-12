/**
 * PIT PARTY - a split-screen kart Grand Prix "Game From Doot". One big screen runs
 * a 3D kart race; the crowd joins on their phones, each picks a driver + a kart
 * (Mario-Kart-style stats), and races over the relay. Up to four phones drive the
 * split-screen big screen at once (CPUs fill the grid); everyone else watches the
 * live WebRTC stream by room code.
 *
 * A CUSTOM-FLOW game (like Retro Arcade / Quiz or Die): it ships a custom
 * Host/Player/Audience that drive the whole show over the relay's `/x/` channels,
 * with the parked `pit-race` round giving the engine a round to sit on. All the race
 * math is the pure, tested simulation in `sim/` + `logic.ts`.
 */
import { defineGame } from '@doot-games/sdk'
import { raceBlock } from './block'
import PitPartyAudience from './Audience.vue'
import PitPartyHost from './Host.vue'
import PitPartyPlayer from './Player.vue'

const config = { title: 'Pit Party', rounds: [{ block: 'pit-race', content: {} }] }

export const pitParty = defineGame({
  manifest: {
    id: 'pit-party',
    name: 'Pit Party',
    version: '0.1.0',
    description: 'A split-screen kart Grand Prix. Drive from your phone, drift for boosts, race for the cup.',
    author: 'Doot',
    capabilities: ['timer', 'music'],
    minPlayers: 1,
    maxPlayers: 8,
    flagship: true,
  },
  blocks: [raceBlock],
  components: { Host: PitPartyHost, Player: PitPartyPlayer, Audience: PitPartyAudience },
  defaultConfig: config,
  // No deck pool; the courses live in code. buildConfig keeps the static config
  // (the flagship contract wants a buildConfig present, like Retro Arcade).
  buildConfig: () => config,
})
