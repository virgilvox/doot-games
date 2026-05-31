/**
 * Circuit Cypher, the robot rap battle (Mad Verse City-style) and the fourth
 * flagship. Players fill the blanks in a braggy robot verse (they see the line,
 * so they can make it rhyme), then the room reaches the judge round where the
 * host can have the robots PERFORM each verse aloud (browser speechSynthesis,
 * client-only) over a beat before everyone votes for the hottest bars.
 *
 * Pure composition, [fill, vote(perform), ...], built on the same two-phase
 * engine as Mad Libs and Quip Clash: the vote round derives its options from the
 * filled verses of the round before it. A fresh set of verses is drawn from a
 * pool each play (buildConfig). The performance is decorative; the vote flow
 * never depends on it, so the game is fully playable where TTS is unavailable.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { fillBlock } from '../blocks/fill/block'
import { voteBlock } from '../blocks/vote/block'
import { seededShuffle } from '../runtime/derive'

interface Verse {
  template: string
  blanks: Array<{ id: string; label: string }>
}

/** Robot-rap verse scaffolds. `{id}` placeholders match the blank ids; the fixed
 *  words carry the rhyme, the blanks carry the flavor. Players see the line. */
const VERSE_POOL: Verse[] = [
  {
    template: "I'm a {adj} machine with a {noun} for a heart,\nI'll {verb} on the mic and tear your verse apart.",
    blanks: [
      { id: 'adj', label: 'A boastful adjective' },
      { id: 'noun', label: 'A noun (your cold robot heart)' },
      { id: 'verb', label: 'A verb (what you do on the mic)' },
    ],
  },
  {
    template: 'They booted me up and I started to {verb},\nspittin’ {adj} bytes that the haters can’t {verb2}.',
    blanks: [
      { id: 'verb', label: 'A verb' },
      { id: 'adj', label: 'An adjective' },
      { id: 'verb2', label: 'A verb (rhyme it with the first one)' },
    ],
  },
  {
    template: "My flow’s got more {plural} than a {adj} hard drive,\nstep to the cypher, you won’t leave alive.",
    blanks: [
      { id: 'plural', label: 'A plural noun' },
      { id: 'adj', label: 'An adjective' },
    ],
  },
  {
    template: "Beep boop, I’m the king of this {place},\ndroppin’ {adj} rhymes all up in your {bodypart}.",
    blanks: [
      { id: 'place', label: 'A place' },
      { id: 'adj', label: 'An adjective' },
      { id: 'bodypart', label: 'A body part' },
    ],
  },
  {
    template: 'I run on {liquid} and pure disrespect,\nmy bars fry your circuits, what did you expect?',
    blanks: [{ id: 'liquid', label: 'A liquid' }],
  },
  {
    template: 'Error 404: your skills not {verbed},\nwhile I {verb} the whole room with every word.',
    blanks: [
      { id: 'verbed', label: 'A verb ending in -ed' },
      { id: 'verb', label: 'A verb' },
    ],
  },
  {
    template: "I’m {adj} like a {animal} with a laser-beam stare,\nI’ll {verb} your whole crew then power down with flair.",
    blanks: [
      { id: 'adj', label: 'An adjective' },
      { id: 'animal', label: 'An animal' },
      { id: 'verb', label: 'A verb' },
    ],
  },
  {
    template: 'Loading my disses… they’re {adj} and mean,\nthe coldest little {noun} that you’ve ever seen.',
    blanks: [
      { id: 'adj', label: 'An adjective' },
      { id: 'noun', label: 'A noun' },
    ],
  },
  {
    template: 'My rhymes are {adj}, my logic is {adj2},\nI’ll {verb} through your defense, it’s no contest at all.',
    blanks: [
      { id: 'adj', label: 'An adjective' },
      { id: 'adj2', label: 'An adjective' },
      { id: 'verb', label: 'A verb' },
    ],
  },
  {
    template: 'Plug me in and watch me {verb},\nI’m a {adj} {noun} and I came to serve.',
    blanks: [
      { id: 'verb', label: 'A verb' },
      { id: 'adj', label: 'An adjective' },
      { id: 'noun', label: 'A noun' },
    ],
  },
]

const ROUNDS_PER_GAME = 3

/** One verse round + the performing vote that judges it. The vote derives its
 *  options from the fill round (the default `from`: the previous round). */
function pair(verse: Verse): RoundInstance[] {
  return [
    {
      block: 'fill',
      content: {
        subject: 'The Cypher',
        prompt: 'Drop your bars — fill the blanks to finish the verse.',
        template: verse.template,
        blanks: verse.blanks,
        maxLength: 24,
        timer: 75,
        // Show the line so players can make it rhyme (unlike blind Mad Libs).
        showTemplate: true,
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
    version: '0.1.0',
    description:
      'A robot rap battle: fill the blanks in a verse, let the robots perform the bars, then vote for the hottest flow.',
    author: 'Doot',
    capabilities: ['timer', 'music'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [fillBlock, voteBlock],
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
