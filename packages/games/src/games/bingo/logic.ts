/**
 * Pure, tested logic for Bingo, a custom-flow party game for a room with a screen
 * up front. Every player gets a UNIQUE card dealt from a shared pool, seeded by the
 * room + their player id, so it is deterministic and reconnect-safe (re-entering the
 * same name in the same room re-deals the identical card, no relay write needed). The
 * host calls items one at a time; players mark what they have; the first to complete a
 * line claims a bingo, which the host verifies by re-deriving that player's card from
 * the same seed and checking the line against what has actually been called.
 *
 * Nothing here is secret: a card is public information (the fun is the race), so there
 * is no answer-withholding and the cards never travel the relay. The custom Host/Player
 * drive the live show over `/x/` channels; everything that decides a win or a score
 * lives here so it can be unit-tested.
 */
import { seededShuffle } from '../../runtime/derive'

/** Supported card sizes. Odd sizes (3, 5) get a free center; 4 has none. */
export const BINGO_SIZES = [3, 4, 5] as const
export type BingoSize = (typeof BINGO_SIZES)[number]
export const DEFAULT_SIZE: BingoSize = 5

/** A dealt card: a flat row-major array of `size * size` cells. The free center (odd
 *  sizes) is the empty string at `freeIndex`; every other cell is a pool item. */
export interface BingoCard {
  size: number
  free: boolean
  cells: string[]
}

/** The center index of an odd-sized card (the free space), else null. */
export function freeIndex(size: number): number | null {
  return size % 2 === 1 ? Math.floor((size * size) / 2) : null
}

/** How many distinct pool items a card of this size needs (minus the free center). */
export function cellsNeeded(size: number): number {
  return size * size - (size % 2 === 1 ? 1 : 0)
}

/**
 * Deal `pid`'s card from `pool`, seeded by room + pid so it is identical on every
 * client and on reconnect. Duplicates in the pool are dropped first. If the pool is
 * too small to fill the card, the leftover cells are empty strings, which never count
 * as covered (only the free center does), so a short pool can't hand out a free line.
 */
export function buildCard(seed: string, pid: string, pool: string[], size: number): BingoCard {
  const free = size % 2 === 1
  const fi = freeIndex(size)
  const picks = seededShuffle(`bingo:card:${seed}:${pid}`)([...new Set(pool)]).slice(0, cellsNeeded(size))
  const cells: string[] = []
  let p = 0
  for (let i = 0; i < size * size; i++) cells.push(i === fi ? '' : (picks[p++] ?? ''))
  return { size, free, cells }
}

/** Every winning line (each row, each column, both diagonals) as index arrays. */
export function lines(size: number): number[][] {
  const out: number[][] = []
  for (let r = 0; r < size; r++) out.push(Array.from({ length: size }, (_, c) => r * size + c))
  for (let c = 0; c < size; c++) out.push(Array.from({ length: size }, (_, r) => r * size + c))
  out.push(Array.from({ length: size }, (_, i) => i * size + i))
  out.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)))
  return out
}

/** Is cell `index` of `card` covered: the free center always, else its item must have
 *  been called. An empty non-free cell (short pool) is never covered. */
export function isCovered(card: BingoCard, index: number, called: ReadonlySet<string>): boolean {
  if (card.free && index === freeIndex(card.size)) return true
  const item = card.cells[index]
  return !!item && called.has(item)
}

/** The winning lines a card has completed against the called set (usually 0 or 1). */
export function completedLines(card: BingoCard, called: ReadonlySet<string>): number[][] {
  return lines(card.size).filter((line) => line.every((i) => isCovered(card, i, called)))
}

/** Does the card have at least one complete line? */
export function hasBingo(card: BingoCard, called: ReadonlySet<string>): boolean {
  return lines(card.size).some((line) => line.every((i) => isCovered(card, i, called)))
}

/**
 * Verify a claim host-side: re-derive the claimant's card from the seed and confirm it
 * actually has a complete line among what has been called. The player's claimed line is
 * advisory (for display); the real condition is `hasBingo`, so a tampered client can't
 * win without the cells genuinely being called.
 */
export function verifyClaim(seed: string, pid: string, pool: string[], size: number, called: ReadonlySet<string>): boolean {
  return hasBingo(buildCard(seed, pid, pool, size), called)
}

/** The deterministic order the host calls items in, seeded by room (reconnect-stable). */
export function callOrder(seed: string, pool: string[]): string[] {
  return seededShuffle(`bingo:calls:${seed}`)([...new Set(pool)])
}

/** Placement points: first bingo is worth the most, then a gentle drop, so a fast
 *  full-house room still rewards getting there first without shutting out everyone else. */
export function placePoints(place: number): number {
  if (place <= 1) return 100
  if (place === 2) return 60
  if (place === 3) return 40
  return 20
}

export interface Winner {
  pid: string
  name: string
  /** 1 for the first bingo, 2 for the next, ... */
  place: number
}

export interface LeaderRow {
  id: string
  name: string
  score: number
}

/** Final board: every player at 0, plus placement points for each bingo, sorted. */
export function bingoLeaderboard(winners: Winner[], roster: Array<{ id: string; name: string }>): LeaderRow[] {
  const score = new Map<string, number>()
  const name = new Map<string, string>()
  for (const r of roster) {
    score.set(r.id, 0)
    name.set(r.id, r.name)
  }
  for (const w of winners) {
    name.set(w.pid, w.name)
    score.set(w.pid, (score.get(w.pid) ?? 0) + placePoints(w.place))
  }
  return [...score.entries()]
    .map(([id, s]) => ({ id, name: name.get(id) ?? 'Player', score: s }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

/** Built-in, brand-free call pools. Each is a flat list of short items a host reads
 *  aloud; 25+ items so a 5x5 card always fills. The host picks a pack in the lobby. */
export interface BingoPack {
  key: string
  name: string
  blurb: string
  items: string[]
}

export const BINGO_PACKS: BingoPack[] = [
  {
    key: 'meeting',
    name: 'Meeting Bingo',
    blurb: 'Buzzwords that haunt every call.',
    items: [
      'Synergy', 'Circle back', 'Low-hanging fruit', 'Touch base', 'Deep dive',
      'Move the needle', 'Bandwidth', 'Take it offline', 'Pivot', 'Leverage',
      'Streamline', 'Action item', 'Ping me', 'Quick win', 'Game changer',
      'Best practice', 'Paradigm shift', 'Same page', 'Drill down', 'Value add',
      'Ducks in a row', 'Up the flagpole', 'Boil the ocean', 'Hard stop', 'Loop you in',
      'Sync up', 'Net net', 'Win-win', 'Table that', 'Wheelhouse',
    ],
  },
  {
    key: 'party',
    name: 'Party Bingo',
    blurb: 'Things that always happen at a get-together.',
    items: [
      'Arrives late', 'Drink spilled', 'Doorbell rings', 'Phone dies',
      'Group photo', 'Music gets changed', 'A toast', 'Pizza arrives',
      'Same story again', 'A pet shows up', 'Snacks run out',
      'Someone naps', 'Board game starts', 'Lights dimmed', 'Karaoke',
      'Hiding in kitchen', 'Long hug goodbye', 'Empty plans made',
      'Bad joke flops', 'Host says sorry', 'Ice runs out',
      'Phone photo tour', 'Pointless debate', 'First to leave', 'Last to leave',
      'Sudden dance', 'A double-dip', 'Good chair taken',
    ],
  },
  {
    key: 'roadtrip',
    name: 'Road Trip Bingo',
    blurb: 'Spot it out the window.',
    items: [
      'A red car', 'A truck honks', 'A cow', 'A billboard', 'A motorcycle',
      'A rest stop', 'A tunnel', 'A bridge', 'Road work', 'A police car',
      'A far-away plate', 'Dog, head out', 'A flat tire',
      'A school bus', 'A horse', 'A water tower', 'A train', 'A traffic jam',
      'A scenic view', 'A gas station', 'A hitchhiker', 'A windmill',
      'A "Welcome" sign', 'A speed trap', 'Roadkill', 'A camper van',
      'Funny sticker', 'A mile marker',
    ],
  },
]

export function packByKey(key: string): BingoPack {
  return BINGO_PACKS.find((p) => p.key === key) ?? BINGO_PACKS[0]!
}
