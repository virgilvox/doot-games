/**
 * Bingo, a custom-flow party game for a room with a screen up front (a bar, a
 * classroom, a living room). Every player gets a UNIQUE card dealt from a shared pack,
 * seeded by the room + their player id so it is deterministic and reconnect-safe; the
 * host calls items one at a time off the big screen; players mark what they have; and
 * the first to complete a line claims a bingo, which the host verifies before crowning.
 *
 * This is a CUSTOM-FLOW game: it ships a custom Host + Player that drive the deal, the
 * calls, and the claims over the relay's custom `/x/` channels (the proven Circuit
 * Cypher / Truth or Share transport), with the parked `bingo` round giving the engine a
 * round to sit on. All the win detection and scoring is the pure, tested logic in
 * `logic.ts`. Nothing is withheld (a card is public), so there is no answer redaction.
 */
import { defineGame } from '@doot-games/sdk'
import { bingoBlock } from '../../blocks/bingo/block'
import { BINGO_PACKS, DEFAULT_SIZE } from './logic'
import BingoHost from './Host.vue'
import BingoPlayer from './Player.vue'

const packs = BINGO_PACKS.map((p) => ({ key: p.key, name: p.name, blurb: p.blurb, items: p.items }))

export const bingo = defineGame({
  manifest: {
    id: 'bingo',
    name: 'Bingo',
    version: '0.1.0',
    description: 'Everyone gets a unique card. The host calls it; mark yours and race to a line. First bingo wins.',
    author: 'Doot',
    capabilities: [],
    minPlayers: 2,
    flagship: true,
  },
  blocks: [bingoBlock],
  components: { Host: BingoHost, Player: BingoPlayer },
  defaultConfig: { title: 'Bingo', rounds: [{ block: 'bingo', content: { size: DEFAULT_SIZE, packs } }] },
  // Built-in packs only (no creator deck yet); buildConfig keeps the flagship contract
  // and hands the same packs through. The per-room call order + the per-player cards are
  // both seeded by the room code at runtime, so each session already plays differently.
  buildConfig: () => ({ title: 'Bingo', rounds: [{ block: 'bingo', content: { size: DEFAULT_SIZE, packs } }] }),
})
