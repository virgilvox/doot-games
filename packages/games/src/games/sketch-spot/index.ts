/**
 * Sketch & Spot, the Drawful-style flagship: everyone sketches the same prompt
 * on their phone, then the room votes for the best (or funniest) drawing. Pure
 * composition, [draw, drawvote, ...]: the drawvote round derives its gallery
 * from the prior draw round's strokes, anonymized and shuffled. A fresh set of
 * prompts is drawn from a pool each play (buildConfig). It proves the Draw block
 * inside the two-phase make->judge loop.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { drawBlock } from '../../blocks/draw/block'
import { drawVoteBlock } from '../../blocks/drawvote/block'
import { promptFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

/** A pool of quick, evocative draw prompts (brand-free, family-friendly). */
const PROMPT_POOL: string[] = [
  'A dog driving a car',
  'The worst possible superhero',
  'A robot in love',
  'Breakfast on the moon',
  'A monster under the bed',
  'Your pet as a wrestler',
  'A vegetable having a bad day',
  'The last slice of pizza',
  'A shark wearing a hat',
  'An alien tourist on Earth',
  'A dinosaur at a birthday party',
  'A very fancy potato',
  'A cat plotting world domination',
  'The grumpiest cloud',
  'A snail in a hurry',
  'A haunted sandwich',
]

const ROUNDS_PER_GAME = 3

function pair(prompt: string): RoundInstance[] {
  return [
    // liveGallery off: the drawings stay hidden on the big screen during drawing,
    // then the gallery is revealed for the vote (no spoiler, blind vote). A
    // generous draw timer: sketching takes longer than typing a quip.
    { block: 'draw', content: { prompt, image: '', timer: 120, aspect: 0.7, liveGallery: false } },
    // The drawvote round derives its gallery from the draw round (the previous
    // round), so no `from` needed.
    { block: 'drawvote', content: { prompt: 'Which drawing wins?', options: [], aspect: 0.7, timer: 30 } },
  ]
}

function deckFrom(prompts: string[]): RoundInstance[] {
  return prompts.flatMap(pair)
}

/** The built-in pool as deck rows; a creator Prompt Deck overrides these. */
const DEFAULT_ROWS = PROMPT_POOL.map((prompt) => ({ prompt }))

export const sketchSpot = defineGame({
  manifest: {
    id: 'sketch-spot',
    name: 'Sketch & Spot',
    version: '0.1.0',
    description: 'Sketch the prompt on your phone, then vote for the best drawing. The room makes the art.',
    author: 'Doot',
    capabilities: ['timer', 'drawing'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [drawBlock, drawVoteBlock],
  defaultConfig: { title: 'Sketch & Spot', rounds: deckFrom(PROMPT_POOL.slice(0, ROUNDS_PER_GAME)) },
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: promptFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: 'Sketch & Spot', rounds: deckFrom(seededShuffle(`sketch:${seed}`)(rows).slice(0, n).map((r) => String(r.prompt))) }
  },
  roundOptions: { min: 1, max: 8, default: ROUNDS_PER_GAME, label: 'Prompts' },
})
