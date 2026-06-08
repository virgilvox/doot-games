/**
 * A server-safe catalog of the first-party game types, plain data only, with
 * NO imports of blocks or `.vue` views. The Nitro server (e.g. saved-games
 * validation) and any pure context can import this without pulling the Vue
 * component graph that `registry.ts` brings in. A test asserts it stays in sync
 * with the real registry (`catalog.test.ts`).
 */
import type { DeckKind } from '@doot-games/sdk'

export interface GameCatalogEntry {
  id: string
  name: string
  description: string
  /** Semver from the plugin manifest (surfaced on cards as "vX.Y.Z"). */
  version: string
  /** A first-party, ready-to-play "Game From Doot" (deeply replayable, host-now)
   *  vs an editor template/building-block type. */
  flagship: boolean
  /** Deck-feedable pool game: a creator can attach a deck of this `deckKind` to play
   *  their own content. `placeholderBlock` is the make block stored as the (vestigial)
   *  saved-config round — the host regenerates rounds from the deck via buildConfig.
   *  `answerColumns` (when present) names the attached deck's answer-bearing columns, so
   *  the serve path can withhold them from non-owners (invariant #3). A test keeps all of
   *  this in sync with the plugin's `contentPool` + defaultConfig. */
  pool?: { deckKind: DeckKind; placeholderBlock: string; answerColumns?: string[] }
}

export const gameCatalog: GameCatalogEntry[] = [
  { id: 'guess', name: 'Guess', version: '0.2.0', flagship: false, description: 'Multiple-choice rounds with a right answer, scored on a leaderboard.' },
  { id: 'rate', name: 'Rate', version: '0.2.0', flagship: false, description: 'Score subjects on flexible scales: numbers, grades, or tiers.' },
  { id: 'poll', name: 'Poll', version: '0.1.0', flagship: false, description: 'Opinion questions with no right answer; show the live results.' },
  { id: 'rank', name: 'Rank', version: '0.1.0', flagship: false, description: 'Players order a set of items into one room ranking.' },
  { id: 'draw', name: 'Draw', version: '0.1.0', flagship: false, description: "Sketch the prompt on your phone; the drawings fill the screen." },
  { id: 'buzzer', name: 'Buzzer', version: '0.1.0', flagship: false, description: 'First-correct trivia: buzz in fast, the quickest right answer scores the most.' },
  { id: 'votebox', name: 'VoteBox', version: '0.2.0', flagship: false, description: 'Guess then Rate, the original Doot party game.' },
  { id: 'quip-clash', name: 'Quip Clash', version: '0.1.0', flagship: true, description: 'Answer a prompt, then vote for the funniest answer.', pool: { deckKind: 'prompt', placeholderBlock: 'quip' } },
  { id: 'mad-libs', name: 'Mad Libs', version: '0.1.0', flagship: true, description: "Fill a story's blanks, then vote for the funniest tale.", pool: { deckKind: 'generic', placeholderBlock: 'fill' } },
  { id: 'split-room', name: 'Split the Room', version: '0.1.0', flagship: true, description: 'Finish a divisive "would you?" then vote yes or no.', pool: { deckKind: 'prompt', placeholderBlock: 'fill' } },
  { id: 'fib-finder', name: 'Fib Finder', version: '0.1.0', flagship: true, description: 'Invent a believable lie to a trivia question, then spot the one true answer.', pool: { deckKind: 'quiz', placeholderBlock: 'quip', answerColumns: ['truth', 'answer'] } },
  { id: 'sketch-spot', name: 'Sketch & Spot', version: '0.1.0', flagship: true, description: 'Sketch the prompt on your phone, then vote for the best drawing.', pool: { deckKind: 'prompt', placeholderBlock: 'draw' } },
  { id: 'circuit-cypher', name: 'Circuit Cypher', version: '0.3.0', flagship: true, description: 'A robot rap battle: write rhyming bars, then the robots face off head to head and the crowd votes.' },
  { id: 'what-you-didnt-know', name: "What, You Didn't Know That?", version: '0.1.0', flagship: true, description: 'A trivia gameshow: rising stakes, hidden answers, first to buzz in wins.', pool: { deckKind: 'quiz', placeholderBlock: 'buzzer', answerColumns: ['correct', 'answer'] } },
  { id: 'backronym', name: 'Backronym', version: '0.1.0', flagship: true, description: 'Famous initials appear; invent what they REALLY stand for, then vote the best.', pool: { deckKind: 'prompt', placeholderBlock: 'quip' } },
  { id: 'open-mic', name: 'Open Mic', version: '0.1.0', flagship: true, description: 'Write a one-liner, let the robots deliver it deadpan, then vote the funniest bit.', pool: { deckKind: 'prompt', placeholderBlock: 'quip' } },
  { id: 'hivemind', name: 'Hivemind', version: '0.1.0', flagship: true, description: 'Answer the prompt like everyone else; matching the crowd is the whole game.', pool: { deckKind: 'prompt', placeholderBlock: 'hivemind' } },
  { id: 'most-likely', name: 'Most Likely To', version: '0.1.0', flagship: true, description: "Vote a player for each 'most likely to...' prompt; the room's pick is revealed.", pool: { deckKind: 'prompt', placeholderBlock: 'mostlikely' } },
  { id: 'ballpark', name: 'Ballpark', version: '0.1.0', flagship: true, description: 'Numeric trivia where the closest guess wins. Get in the ballpark.', pool: { deckKind: 'quiz', placeholderBlock: 'ballpark', answerColumns: ['answer', 'value'] } },
  { id: 'faker', name: 'Faker', version: '0.1.0', flagship: true, description: 'Everyone gets a secret word except one faker. Give a clue, then sniff out who is bluffing.', pool: { deckKind: 'card', placeholderBlock: 'faker', answerColumns: ['word', 'secret'] } },
  { id: 'truth-or-share', name: 'Truth or Share', version: '0.1.0', flagship: true, description: 'Put someone in the spotlight with a prompt, answer or pass, and the room reacts. Pick well and you score too.', pool: { deckKind: 'prompt', placeholderBlock: 'spotlight' } },
  { id: 'quiz-or-die', name: 'Quiz or Die', version: '0.1.0', flagship: true, description: 'A deadly quiz show. Answer right and walk free; answer wrong and meet the host in the Cellar. The last one out the door survives.', pool: { deckKind: 'quiz', placeholderBlock: 'cellar', answerColumns: ['correct', 'answer', 'belong'] } },
  { id: 'type-the-answer', name: 'Type the Answer', version: '0.1.0', flagship: true, description: 'Free-text trivia: type the answer on your phone. Spelling and accents are forgiven.', pool: { deckKind: 'quiz', placeholderBlock: 'answer', answerColumns: ['answers', 'answer'] } },
  { id: 'would-you-rather', name: 'Would You Rather', version: '0.1.0', flagship: true, description: 'Forced-choice dilemmas: the room picks a side and you see how it split.', pool: { deckKind: 'generic', placeholderBlock: 'poll' } },
  { id: 'tier-list', name: 'Tier List', version: '0.1.0', flagship: true, description: 'Rank anything from S to D. The room decides where each one lands.', pool: { deckKind: 'prompt', placeholderBlock: 'rate' } },
  { id: 'over-under', name: 'Over / Under', version: '0.1.0', flagship: true, description: 'Estimation trivia: is the real figure over or under the line? Closest call climbs the board.', pool: { deckKind: 'quiz', placeholderBlock: 'guess', answerColumns: ['correct', 'answer'] } },
  { id: 'categories', name: 'Categories', version: '0.1.0', flagship: true, description: 'Scattergories: a letter, a few categories, race to fill them in. Unique answers score.', pool: { deckKind: 'prompt', placeholderBlock: 'categories' } },
  { id: 'survey', name: 'Survey', version: '0.1.0', flagship: true, description: 'Family-feud style: we surveyed the board; name the top answers to score.', pool: { deckKind: 'quiz', placeholderBlock: 'survey', answerColumns: ['answers', 'board'] } },
  { id: 'spectrum', name: 'Spectrum', version: '0.1.0', flagship: true, description: 'Slide the dial to place each hot take. Land near the room and you score.', pool: { deckKind: 'generic', placeholderBlock: 'spectrum' } },
  { id: 'wager', name: 'Wager', version: '0.1.0', flagship: true, description: 'High-stakes trivia: bet on your answer. Right adds your bet, wrong takes it. Richest wins.', pool: { deckKind: 'quiz', placeholderBlock: 'wager', answerColumns: ['correct', 'answer'] } },
  { id: 'story-chain', name: 'Story Chain', version: '0.1.0', flagship: true, description: 'Pass-it-on storytelling: write a line, send it on, and watch each tale drift somewhere absurd.' },
  { id: 'custom', name: 'Custom', version: '0.1.0', flagship: false, description: 'Mix any blocks, or paste a markdown spec to build a whole game at once.' },
]

/** The first-party ready-to-play games ("Games From Doot"). */
export const flagshipGames = gameCatalog.filter((g) => g.flagship)
/** The editor templates / building-block types (everything else). */
export const templateGames = gameCatalog.filter((g) => !g.flagship)

const ids = new Set(gameCatalog.map((g) => g.id))

export function isKnownPlugin(id: string): boolean {
  return ids.has(id)
}

/**
 * Per-block-kind answer fields to overwrite when serving a saved config to a
 * non-owner, so the answer-withholding invariant holds at the API boundary too
 * (mirrors each block's `redactContent`). Server-safe (data only). A test
 * (`catalog.test.ts`) asserts every block with an `answerOf` is listed here, so
 * a new answer-bearing block can't silently leak through the API.
 */
export const REDACTION_RULES: Record<string, Record<string, unknown>> = {
  guess: { correct: -1 },
  // Type-the-answer trivia: the accepted answers are the key; blank them before
  // serving a saved answer-based game to a non-owner.
  answer: { answers: [] },
  // Survey (Family Feud): the ranked board is the answer key; blank it for non-owners.
  survey: { answers: [] },
  // Wager: the correct option is the key; strip it for non-owners (like guess).
  wager: { correct: -1 },
  buzzer: { correct: -1 },
  // Fib Finder's truth is the answer key: strip it (and any derived options)
  // before serving a saved fibvote-based game to a non-owner.
  fibvote: { truth: '', options: [] },
  // Ballpark's true number is the answer key: null it before serving to a non-owner.
  ballpark: { answer: null },
  // Faker's secret word is delivered privately per-player; strip it from the public
  // config so a non-owner (or a spectator) never reads the word from a saved game.
  faker: { word: '' },
  // Quiz or Die's trivia keys (per-question correct index) + finale "belongs"
  // flags live in the cellar block content: blank the answer-bearing arrays so a
  // non-owner viewing a saved game can't read the answers.
  cellar: { questions: [], finalCats: [] },
}

// ── Deck redaction (data-only, server-safe) ─────────────────────────────────
// A round can bind a content field to a content deck's column (mode-1 bindings).
// If that field is an answer key (named in REDACTION_RULES for its block), the bound
// deck COLUMN holds the answer and must be stripped before a non-owner sees the saved
// config, exactly like the round's own answer field. Mirrors `redactContent`/the round
// rules; a catalog test covers it. (Mode-2 typed pools are phase 2.)
interface RedactRound {
  block: string
  bindings?: Record<string, { deck: string; column: string }>
}
interface RedactInlineDeck {
  columns: unknown[]
  rows: Array<Record<string, unknown>>
  kind?: string
}
type RedactDeckUse = { inline: RedactInlineDeck } | { ref: string; version?: number }

/** Return a copy of `decks` with every answer-bearing column nulled for a non-owner:
 *  columns a round BINDS to an answer field (mode 1), plus the columns a typed POOL deck
 *  (the reserved `pool` key) exposes as answers (named by the game's `contentPool.answerColumns`,
 *  surfaced here via the catalog entry's `pool.answerColumns`). Pure; leaves non-secret
 *  columns + references untouched. `pluginId` enables the pool-deck redaction. */
export function redactDecks(
  rounds: RedactRound[],
  decks: Record<string, RedactDeckUse> | undefined,
  pluginId?: string,
): Record<string, RedactDeckUse> | undefined {
  if (!decks) return decks
  const secret = new Map<string, Set<string>>() // deckId -> secret columns
  for (const r of rounds) {
    const rule = REDACTION_RULES[r.block]
    if (!rule || !r.bindings) continue
    for (const [fieldPath, ref] of Object.entries(r.bindings)) {
      const leaf = fieldPath.split('.').pop() ?? fieldPath
      if (leaf in rule) {
        if (!secret.has(ref.deck)) secret.set(ref.deck, new Set())
        secret.get(ref.deck)!.add(ref.column)
      }
    }
  }
  // A typed-pool game attaches its answer-bearing deck under the reserved `pool` key, not
  // via round bindings, so withhold its answer columns by the game's declared list.
  const poolAnswers = pluginId ? gameCatalog.find((g) => g.id === pluginId)?.pool?.answerColumns : undefined
  if (poolAnswers?.length && decks.pool) {
    if (!secret.has('pool')) secret.set('pool', new Set())
    for (const c of poolAnswers) secret.get('pool')!.add(c)
  }
  if (secret.size === 0) return decks
  const out: Record<string, RedactDeckUse> = {}
  for (const [id, use] of Object.entries(decks)) {
    const cols = secret.get(id)
    if (!cols || !('inline' in use)) {
      out[id] = use
      continue
    }
    out[id] = {
      ...use,
      inline: {
        ...use.inline,
        rows: use.inline.rows.map((row) => {
          const r: Record<string, unknown> = { ...row }
          for (const c of cols) if (c in r) r[c] = null
          return r
        }),
      },
    }
  }
  return out
}
