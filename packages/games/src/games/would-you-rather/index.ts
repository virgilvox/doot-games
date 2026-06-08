/**
 * Would You Rather, the classic forced-choice party game. Each round poses a
 * dilemma with two options; the room picks one and the big screen shows how it
 * split. No right answer, it's about the debate. A single-block composition over
 * the `poll` block, drawing a fresh set of dilemmas from a large pool each play.
 *
 * Deck-feedable: attach a deck with two choice columns (e.g. `a`/`b`) and the host
 * plays your dilemmas instead of the built-in pool.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { pollBlock } from '../../blocks/poll/block'
import { binaryFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

interface Row {
  a: string
  b: string
}

/** Built-in dilemmas (party-safe, no em dashes). A creator deck overrides these. */
const POOL: Row[] = [
  { a: 'Be able to fly', b: 'Be invisible' },
  { a: 'Have unlimited pizza', b: 'Have unlimited tacos' },
  { a: 'Always be 10 minutes late', b: 'Always be 20 minutes early' },
  { a: 'Live without music', b: 'Live without movies' },
  { a: 'Fight one horse-sized duck', b: 'Fight a hundred duck-sized horses' },
  { a: 'Read minds', b: 'See the future' },
  { a: 'Never use a touchscreen again', b: 'Never use a keyboard again' },
  { a: 'Have a rewind button for your life', b: 'Have a pause button' },
  { a: 'Always know when someone is lying', b: 'Always get away with lying' },
  { a: 'Be a famous singer', b: 'Be a famous actor' },
  { a: 'Live by the beach', b: 'Live in the mountains' },
  { a: 'Give up coffee forever', b: 'Give up dessert forever' },
  { a: 'Have free travel for life', b: 'Have free food for life' },
  { a: 'Be the funniest person in the room', b: 'Be the smartest person in the room' },
  { a: 'Speak every language', b: 'Play every instrument' },
  { a: 'Only whisper', b: 'Only shout' },
  { a: 'Have no sense of smell', b: 'Have no sense of taste' },
  { a: 'Win the lottery', b: 'Find your perfect job' },
  { a: 'Time travel to the past', b: 'Time travel to the future' },
  { a: 'Have a pet dragon', b: 'Have a pet unicorn' },
  { a: 'Never wait in a line again', b: 'Never get stuck in traffic again' },
  { a: 'Be able to talk to animals', b: 'Be able to speak any human language' },
]

const ROUNDS_PER_GAME = 7

function roundsFrom(rows: Row[]): RoundInstance[] {
  return rows.map((r) => ({
    block: 'poll',
    content: {
      prompt: 'Would you rather...',
      image: '',
      timer: 20,
      options: [{ label: r.a }, { label: r.b }],
    },
  }))
}

/** The built-in pool as deck rows; a creator deck overrides these. */
const DEFAULT_ROWS = POOL.map((r) => ({ a: r.a, b: r.b }))

export const wouldYouRather = defineGame({
  manifest: {
    id: 'would-you-rather',
    name: 'Would You Rather',
    version: '0.1.0',
    description: 'Forced-choice dilemmas: the room picks a side and you see how it split.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 2,
    flagship: true,
  },
  blocks: [pollBlock],
  defaultConfig: { title: 'Would You Rather', rounds: roundsFrom(POOL.slice(0, 5)) },
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'generic', fromRow: binaryFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    const picked = seededShuffle(`would-you-rather:${seed}`)(rows)
      .slice(0, n)
      .map((r) => ({ a: String(r.a), b: String(r.b) }))
    return { title: 'Would You Rather', rounds: roundsFrom(picked) }
  },
  roundOptions: { min: 3, max: 15, default: ROUNDS_PER_GAME, label: 'Dilemmas' },
})
