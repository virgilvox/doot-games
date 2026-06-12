/**
 * Retro Arcade, a custom-flow flagship: the host drops in a ROM and it runs in an
 * EmulatorJS emulator on the big screen, while phones (and gamepads plugged into
 * the host) act as the controllers over the relay's custom `/x/` channels. The
 * parked `arcade` round gives the engine a round to sit on; the whole show runs in
 * the custom Host + Player. The console mapping (a logical controller id -> the
 * exact EmulatorJS input index) is the pure, tested code in `logic.ts`.
 *
 * v1 keeps ROMs in the host's browser (a local file or a pasted URL); a URL ROM
 * can be deep-linked (`?rom=...&core=...`) and shared. Non-threaded cores only, so
 * it needs no cross-origin-isolation headers.
 */
import { defineGame } from '@doot-games/sdk'
import { arcadeBlock } from '../../blocks/arcade/block'
import RetroArcadeAudience from './Audience.vue'
import RetroArcadeHost from './Host.vue'
import RetroArcadePlayer from './Player.vue'

const config = { title: 'Retro Arcade', rounds: [{ block: 'arcade', content: {} }] }

export const retroArcade = defineGame({
  manifest: {
    id: 'retro-arcade',
    name: 'Retro Arcade',
    version: '0.1.0',
    description:
      'Any ROM, played together. Phones and gamepads are the controllers, in the room or remote.',
    author: 'Doot',
    capabilities: [],
    minPlayers: 1,
    maxPlayers: 4,
    flagship: true,
  },
  blocks: [arcadeBlock],
  components: {
    Host: RetroArcadeHost,
    Player: RetroArcadePlayer,
    Audience: RetroArcadeAudience,
  },
  defaultConfig: config,
  // No deck pool: the ROM is loaded live by the host. buildConfig keeps the
  // flagship contract and hands the same static config through.
  buildConfig: () => config,
})
