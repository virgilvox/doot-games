/**
 * Backronym, a two-phase make->judge game and a near-twin of Quip Clash: the
 * screen shows a familiar set of initials (NASA, TPS, LOL); players invent what
 * they REALLY stand for, then the room votes the best expansion. It is pure
 * composition, [quip, vote, quip, vote, ...], with no custom views, the same
 * spine Quip Clash proves, swapping the open prompt for a generated initialism.
 *
 * Each play draws a fresh set of initials from a large pool (`buildConfig`,
 * seeded by the room code) so no two rooms get the same game.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { quipBlock } from '../../blocks/quip/block'
import { voteBlock } from '../../blocks/vote/block'
import { promptFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

/** A pool of recognizable initialisms players riff on. Kept PG and pronounceable
 *  so the room can read each expansion aloud at the vote. */
const ACRONYM_POOL: string[] = [
  'NASA',
  'FBI',
  'LOL',
  'TPS',
  'ATM',
  'DIY',
  'BBQ',
  'FAQ',
  'GPS',
  'VIP',
  'RSVP',
  'ASAP',
  'YOLO',
  'SOS',
  'OMG',
  'BRB',
  'FYI',
  'DVD',
  'WiFi',
  'PIN',
  'CEO',
  'DJ',
  'UFO',
  'MVP',
  'AKA',
  'PB&J',
  'IKEA',
  'SCUBA',
  'NPC',
  'TBD',
]

const ROUNDS_PER_GAME = 3

/** Build one quip+vote pair for an initialism. The vote derives from the quip. */
function pair(initials: string): RoundInstance[] {
  return [
    {
      block: 'quip',
      content: {
        prompt: `What does ${initials} really stand for?`,
        placeholder: `${initials} = ...`,
        maxLength: 80,
        timer: 60,
      },
    },
    // The vote round derives its options from the quip round (the previous round,
    // `from`'s default), so no `from` needed. Its own prompt frames the vote since
    // the quip prompt IS topical (the vote block shows: Best answer: "What does...").
    { block: 'vote', content: { prompt: 'Which backronym wins?', options: [], mode: 'field', timer: 30 } },
  ]
}

function deckFrom(initials: string[]): RoundInstance[] {
  return initials.flatMap(pair)
}

/** The built-in pool as deck rows; a creator Prompt Deck overrides these. */
const DEFAULT_ROWS = ACRONYM_POOL.map((prompt) => ({ prompt }))

export const backronym = defineGame({
  manifest: {
    id: 'backronym',
    name: 'Backronym',
    version: '0.1.0',
    description: 'The screen shows famous initials; invent what they REALLY stand for, then vote the best.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [quipBlock, voteBlock],
  // A small fixed deck for the editor preview / fallback.
  defaultConfig: { title: 'Backronym', rounds: deckFrom(ACRONYM_POOL.slice(0, ROUNDS_PER_GAME)) },
  // The pool is deck-feedable: attach a Prompt Deck of initialisms to play your own.
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: promptFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: 'Backronym', rounds: deckFrom(seededShuffle(`backronym:${seed}`)(rows).slice(0, n).map((r) => String(r.prompt))) }
  },
  roundOptions: { min: 1, max: 8, default: ROUNDS_PER_GAME, label: 'Initialisms' },
})
