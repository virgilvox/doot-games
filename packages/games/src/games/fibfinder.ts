/**
 * Fib Finder, the Fibbage flagship: a trivia question with a blank, where each
 * player invents a believable LIE to fill it. The lies are mixed with the one
 * real answer and the room votes for which is TRUE. Dual-axis scoring (the
 * fibvote block): find the truth, and fool the room with your lie.
 *
 * Pure composition, [quip, fibvote, ...]: the quip round collects the lies, the
 * fibvote round derives its options from them and injects the withheld truth. A
 * fresh set of questions is drawn from a pool each play (buildConfig).
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { fibBlock } from '../blocks/fibvote/block'
import { quipBlock } from '../blocks/quip/block'
import { seededShuffle } from '../runtime/derive'

interface Fact {
  /** The question, with a blank ('___') where the answer goes. */
  question: string
  /** The real answer. */
  truth: string
}

/** A pool of brand-free, family-friendly "fill the blank" facts. */
const FACT_POOL: Fact[] = [
  { question: 'A group of owls is called a ___.', truth: 'parliament' },
  { question: "The dot over a lowercase 'i' is called a ___.", truth: 'tittle' },
  { question: 'The largest desert on Earth is the ___ Desert.', truth: 'Antarctic' },
  { question: 'The only mammal that cannot jump is the ___.', truth: 'elephant' },
  { question: 'A group of flamingos is called a ___.', truth: 'flamboyance' },
  { question: 'An octopus has ___ hearts.', truth: 'three' },
  { question: 'Carrots were originally ___ in color.', truth: 'purple' },
  { question: 'The national animal of Scotland is the ___.', truth: 'unicorn' },
  { question: "A shrimp's heart is located in its ___.", truth: 'head' },
  { question: 'Wombat droppings are shaped like ___.', truth: 'cubes' },
  { question: 'A snail can sleep for up to ___ years at a time.', truth: 'three' },
  { question: 'The fear of long words is humorously named after the ___.', truth: 'hippopotamus' },
  { question: 'Bananas are berries, but ___ are not.', truth: 'strawberries' },
  { question: 'Honey never spoils because it is very low in ___.', truth: 'water' },
  { question: 'A bolt of lightning is about five times hotter than the surface of the ___.', truth: 'Sun' },
  { question: 'The wood frog survives winter by being completely ___.', truth: 'frozen' },
  { question: 'The hardest natural substance on Earth is the ___.', truth: 'diamond' },
  { question: 'A baby kangaroo is called a ___.', truth: 'joey' },
  { question: 'The loudest animal on Earth, relative to its size, is the ___.', truth: 'shrimp' },
  { question: 'Sea otters hold ___ while they sleep so they do not drift apart.', truth: 'hands' },
]

const ROUNDS_PER_GAME = 4

function pair(fact: Fact): RoundInstance[] {
  return [
    {
      block: 'quip',
      content: {
        prompt: fact.question,
        placeholder: 'Make up a believable answer...',
        maxLength: 60,
        timer: 60,
      },
    },
    // The fibvote round derives its options from the quip round (the previous
    // round) and mixes in the withheld truth.
    { block: 'fibvote', content: { prompt: fact.question, truth: fact.truth, options: [], timer: 30 } },
  ]
}

function deckFrom(facts: Fact[]): RoundInstance[] {
  return facts.flatMap(pair)
}

export const fibFinder = defineGame({
  manifest: {
    id: 'fib-finder',
    name: 'Fib Finder',
    version: '0.1.0',
    description: 'Invent a believable lie to a trivia question, then spot the one true answer. Fool the room and find the truth.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [quipBlock, fibBlock],
  defaultConfig: { title: 'Fib Finder', rounds: deckFrom(FACT_POOL.slice(0, ROUNDS_PER_GAME)) },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, FACT_POOL.length))
    return { title: 'Fib Finder', rounds: deckFrom(seededShuffle(`fib:${seed}`)(FACT_POOL).slice(0, n)) }
  },
  roundOptions: { min: 1, max: 8, default: ROUNDS_PER_GAME, label: 'Questions' },
})
