/**
 * Spectrum, the "read the room on a dial" game. Each round shows a debate with two
 * poles; everyone slides a dial to place it, and you score by landing near the
 * room's consensus. A single-block composition over the `spectrum` block, drawing a
 * fresh set of debates each play (seeded by the room).
 *
 * Deck-feedable: attach a deck with a `prompt` (and optional `left`/`right` poles)
 * and the host plays your debates instead of the built-in pool.
 *
 * NOTE: this is the crowd-consensus dial, not the clue-giver "Wavelength" (which
 * needs per-player views inside a derived round, an engine gap left for later).
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { spectrumBlock } from '../../blocks/spectrum/block'
import { spectrumFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

interface Row {
  prompt: string
  left: string
  right: string
}

/** Built-in debates (party-safe, no brand names). A creator deck overrides these. */
const POOL: Row[] = [
  { prompt: 'Pineapple on pizza', left: 'Disgusting', right: 'Delicious' },
  { prompt: 'A hot dog is a sandwich', left: 'No way', right: 'Absolutely' },
  { prompt: 'Cereal before milk', left: 'Wrong', right: 'Right' },
  { prompt: 'Pets allowed in the bed', left: 'Never', right: 'Always' },
  { prompt: 'Texting back within a minute', left: 'Needy', right: 'Normal' },
  { prompt: 'Mondays', left: 'Hate them', right: 'Love them' },
  { prompt: 'Cilantro', left: 'Tastes like soap', right: 'Delicious' },
  { prompt: 'Working from home', left: 'Lonely', right: 'The dream' },
  { prompt: 'Camping', left: 'Miserable', right: 'Amazing' },
  { prompt: 'Reply-all on a big email', left: 'A crime', right: 'Totally fine' },
  { prompt: 'Socks with sandals', left: 'A crime', right: 'Comfort' },
  { prompt: 'Spicy food', left: 'Too much', right: 'Bring it on' },
  { prompt: 'Reality TV', left: 'Trash', right: 'Treasure' },
  { prompt: 'Karaoke night', left: 'A nightmare', right: 'The best' },
  { prompt: 'Putting milk in tea first', left: 'Chaos', right: 'Correct' },
  { prompt: 'New Year resolutions', left: 'Pointless', right: 'Worth it' },
]

const ROUNDS_PER_GAME = 6

function roundsFrom(rows: Row[]): RoundInstance[] {
  return rows.map((r) => ({
    block: 'spectrum',
    content: { prompt: r.prompt, leftLabel: r.left, rightLabel: r.right, timer: 30 },
  }))
}

/** The built-in pool as deck rows; a creator deck overrides these. */
const DEFAULT_ROWS = POOL.map((r) => ({ prompt: r.prompt, left: r.left, right: r.right }))

export const spectrum = defineGame({
  manifest: {
    id: 'spectrum',
    name: 'Spectrum',
    version: '0.1.0',
    description: 'Slide the dial to place each hot take. Land near the room and you score.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 2,
    flagship: true,
  },
  blocks: [spectrumBlock],
  defaultConfig: { title: 'Spectrum', rounds: roundsFrom(POOL.slice(0, 5)) },
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'generic', fromRow: spectrumFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    const picked = seededShuffle(`spectrum:${seed}`)(rows)
      .slice(0, n)
      .map((r) => ({ prompt: String(r.prompt), left: String(r.left ?? 'Disagree'), right: String(r.right ?? 'Agree') }))
    return { title: 'Spectrum', rounds: roundsFrom(picked) }
  },
  roundOptions: { min: 3, max: 12, default: ROUNDS_PER_GAME, label: 'Debates' },
})
