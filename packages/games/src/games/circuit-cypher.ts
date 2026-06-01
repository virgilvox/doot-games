/**
 * Circuit Cypher, the robot rap battle (Mad Verse City-style) and a flagship
 * "Game From Doot". The robot raps the player the FIRST line of each couplet;
 * the player writes the line that rhymes back. Two couplets => a four-line verse.
 *
 * This is a CUSTOM-FLOW game: it ships `components` (a custom Host + Player) that
 * run a 1v1 tournament the generic block renderer can't sequence. The engine
 * collects everyone's verse in a single `bars` round (round 0), then stays parked
 * there while the host drives a head-to-head bracket as custom relay state (the
 * `/x/battle` channel): each matchup performs robot A's verse over a beat (TTS),
 * then robot B's, the crowd cheers and votes, and the winner is crowned. Cash
 * accumulates across matchups; the top MC takes the cypher. All of the pairing,
 * tallying, and payout is the pure, tested logic in `cypher-bracket.ts`.
 *
 * A fresh verse scaffold is drawn from a pool each play (`buildConfig`), so the
 * couplet leads differ room to room. The performance/beat are decorative; the
 * tournament runs (silently) where TTS or audio is unavailable.
 */
import { defineGame } from '@doot-games/sdk'
import { barsBlock } from '../blocks/bars/block'
import { seededShuffle } from '../runtime/derive'
import CircuitCypherHost from './CircuitCypherHost.vue'
import CircuitCypherPlayer from './CircuitCypherPlayer.vue'

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
  { couplets: [
    { lead: 'I boot up at dawn and I shut down the block,', rhymeWith: 'block' },
    { lead: "Your rhymes buffer slow while my verses don't stop,", rhymeWith: 'stop' },
  ] },
  { couplets: [
    { lead: 'Titanium jaw and a chromium chest,', rhymeWith: 'chest' },
    { lead: 'I compiled this diss and it passed every test,', rhymeWith: 'test' },
  ] },
  { couplets: [
    { lead: 'I speak in machine but the crowd understands,', rhymeWith: 'understands' },
    { lead: "I've got the whole circuit board eating from my hands,", rhymeWith: 'hands' },
  ] },
  { couplets: [
    { lead: "They overclocked my heart and it's pumping pure bass,", rhymeWith: 'bass' },
    { lead: 'Step to the robot and get wiped from the place,', rhymeWith: 'place' },
  ] },
  { couplets: [
    { lead: "I cache every comeback, I never lose track,", rhymeWith: 'track' },
    { lead: 'You swing and you miss while I counter-attack,', rhymeWith: 'attack' },
  ] },
  { couplets: [
    { lead: 'My logic gates open, the verdict is clear,', rhymeWith: 'clear' },
    { lead: "I'm the sharpest little android to power up this year,", rhymeWith: 'year' },
  ] },
]

/** One write round carrying the whole scaffold pool as per-player `variants`: the
 *  custom Host assigns each performer a DIFFERENT scaffold so everyone writes a
 *  different rap (the base `couplets` is the fallback). The battle itself is
 *  custom relay state, not engine rounds. */
function writeRound(verses: Verse[]) {
  const pool = verses.length ? verses : VERSE_POOL
  return {
    block: 'bars',
    content: {
      subject: 'The Cypher',
      prompt: 'Drop your bars: finish each line so it rhymes.',
      couplets: pool[0]!.couplets,
      variants: pool.map((v) => ({ couplets: v.couplets })),
      maxLength: 70,
      timer: 90,
    },
  }
}

export const circuitCypher = defineGame({
  manifest: {
    id: 'circuit-cypher',
    name: 'Circuit Cypher',
    version: '0.3.0',
    description: 'A robot rap battle: write rhyming bars, then the robots face off head to head and the crowd votes.',
    author: 'Doot',
    capabilities: ['timer', 'music'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [barsBlock],
  components: { Host: CircuitCypherHost, Player: CircuitCypherPlayer },
  defaultConfig: { title: 'Circuit Cypher', rounds: [writeRound(VERSE_POOL)] },
  buildConfig: (seed: string) => ({
    title: 'Circuit Cypher',
    rounds: [writeRound(seededShuffle(`cypher:${seed}`)(VERSE_POOL))],
  }),
})
