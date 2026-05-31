/**
 * Circuit Cypher, the robot rap battle (Mad Verse City-style) and the fourth
 * flagship. The robot raps the player the FIRST line of each couplet; the player
 * writes the line that rhymes back. Two couplets => a four-line verse. Then the
 * room reaches the judge round, where an animated robot PERFORMS each verse aloud
 * (browser speechSynthesis, client-only) over a beat before everyone votes for
 * the hottest bars.
 *
 * Pure composition, [bars, vote(perform), ...], on the same two-phase engine as
 * Mad Libs and Quip Clash: the vote round derives its options from the verses of
 * the round before it. A fresh set of verses is drawn from a pool each play
 * (buildConfig). The performance is decorative; the vote flow never depends on
 * it, so the game is fully playable where TTS is unavailable.
 *
 * NEXT (see docs/flagship-games.md): a head-to-head tournament bracket where two
 * robots face off per matchup, live audience cheers during a performance, and a
 * "players perform live" mode (beat + timer instead of TTS).
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { barsBlock } from '../blocks/bars/block'
import { voteBlock } from '../blocks/vote/block'
import { seededShuffle } from '../runtime/derive'

interface Verse {
  couplets: Array<{ lead: string; rhymeWith: string }>
}

/** Robot-rap verse scaffolds. The robot raps `lead`; the player writes the line
 *  that rhymes with `rhymeWith`. Two couplets => a four-line verse. */
const VERSE_POOL: Verse[] = [
  { couplets: [
    { lead: "I'm a top-tier bot and my circuits run hot,", rhymeWith: 'hot' },
    { lead: 'They plugged me in and I started to spit,', rhymeWith: 'spit' },
  ] },
  { couplets: [
    { lead: "Beep boop, step up, you're about to get schooled,", rhymeWith: 'schooled' },
    { lead: "My motherboard's loaded, my logic stays cool,", rhymeWith: 'cool' },
  ] },
  { couplets: [
    { lead: 'I download disses at a terabyte rate,', rhymeWith: 'rate' },
    { lead: 'You’re a dial-up rapper and your flow came late,', rhymeWith: 'late' },
  ] },
  { couplets: [
    { lead: "My antenna's up and I'm picking up signs,", rhymeWith: 'signs' },
    { lead: 'That your wack little verses keep crossing the lines,', rhymeWith: 'lines' },
  ] },
  { couplets: [
    { lead: 'I run on pure voltage and a thousand-watt grin,', rhymeWith: 'grin' },
    { lead: 'Roll up to the cypher, watch me power right in,', rhymeWith: 'in' },
  ] },
  { couplets: [
    { lead: 'They built me in a lab out of chrome and of steel,', rhymeWith: 'steel' },
    { lead: "Now I'm shaking the room with the bars that I peel,", rhymeWith: 'peel' },
  ] },
  { couplets: [
    { lead: 'Error, error, your rhymes do not compute,', rhymeWith: 'compute' },
    { lead: "I'm the baddest little android and I came to refute,", rhymeWith: 'refute' },
  ] },
  { couplets: [
    { lead: "My processor's hot and my memory's deep,", rhymeWith: 'deep' },
    { lead: "I'll out-rap you robots while you're still in sleep,", rhymeWith: 'sleep' },
  ] },
  { couplets: [
    { lead: "I'm wired to the beat and I never miss a cue,", rhymeWith: 'cue' },
    { lead: "So bring your best verse 'cause I'm coming for you,", rhymeWith: 'you' },
  ] },
  { couplets: [
    { lead: "Lights on, gears turn, it's the robot uprising,", rhymeWith: 'uprising' },
    { lead: "My flow's an algorithm that you'll find surprising,", rhymeWith: 'surprising' },
  ] },
]

const ROUNDS_PER_GAME = 3

/** One verse round + the performing vote that judges it. The vote derives its
 *  options from the bars round (the default `from`: the previous round). */
function pair(verse: Verse): RoundInstance[] {
  return [
    {
      block: 'bars',
      content: {
        subject: 'The Cypher',
        prompt: 'Drop your bars: finish each line so it rhymes.',
        couplets: verse.couplets,
        maxLength: 70,
        timer: 90,
      },
    },
    {
      block: 'vote',
      content: {
        prompt: 'Vote for the hottest bars',
        options: [],
        mode: 'field',
        timer: 30,
        perform: true,
      },
    },
  ]
}

function deckFrom(verses: Verse[]): RoundInstance[] {
  return verses.flatMap(pair)
}

export const circuitCypher = defineGame({
  manifest: {
    id: 'circuit-cypher',
    name: 'Circuit Cypher',
    version: '0.2.0',
    description: 'A robot rap battle: write rhyming bars, the robots perform, you vote.',
    author: 'Doot',
    capabilities: ['timer', 'music'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [barsBlock, voteBlock],
  defaultConfig: { title: 'Circuit Cypher', rounds: deckFrom(VERSE_POOL.slice(0, ROUNDS_PER_GAME)) },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, VERSE_POOL.length))
    return {
      title: 'Circuit Cypher',
      rounds: deckFrom(seededShuffle(`cypher:${seed}`)(VERSE_POOL).slice(0, n)),
    }
  },
  roundOptions: { min: 1, max: 6, default: ROUNDS_PER_GAME, label: 'Verses' },
})
