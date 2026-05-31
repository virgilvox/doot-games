/**
 * A server-safe catalog of the first-party game types, plain data only, with
 * NO imports of blocks or `.vue` views. The Nitro server (e.g. saved-games
 * validation) and any pure context can import this without pulling the Vue
 * component graph that `registry.ts` brings in. A test asserts it stays in sync
 * with the real registry (`catalog.test.ts`).
 */
export interface GameCatalogEntry {
  id: string
  name: string
  description: string
  /** Semver from the plugin manifest (surfaced on cards as "vX.Y.Z"). */
  version: string
  /** A first-party, ready-to-play "Game From Doot" (deeply replayable, host-now)
   *  vs an editor template/building-block type. */
  flagship: boolean
}

export const gameCatalog: GameCatalogEntry[] = [
  { id: 'guess', name: 'Guess', version: '0.2.0', flagship: false, description: 'Multiple-choice rounds with a right answer, scored on a leaderboard.' },
  { id: 'rate', name: 'Rate', version: '0.2.0', flagship: false, description: 'Score subjects on flexible scales: numbers, grades, or tiers.' },
  { id: 'poll', name: 'Poll', version: '0.1.0', flagship: false, description: 'Opinion questions with no right answer; show the live results.' },
  { id: 'rank', name: 'Rank', version: '0.1.0', flagship: false, description: 'Players order a set of items into one room ranking.' },
  { id: 'draw', name: 'Draw', version: '0.1.0', flagship: false, description: "Sketch the prompt on your phone; the drawings fill the screen." },
  { id: 'votebox', name: 'VoteBox', version: '0.2.0', flagship: false, description: 'Guess then Rate, the original Doot party game.' },
  { id: 'quip-clash', name: 'Quip Clash', version: '0.1.0', flagship: true, description: 'Answer a prompt, then vote for the funniest answer.' },
  { id: 'mad-libs', name: 'Mad Libs', version: '0.1.0', flagship: true, description: "Fill a story's blanks, then vote for the funniest tale." },
  { id: 'split-room', name: 'Split the Room', version: '0.1.0', flagship: true, description: 'Finish a divisive "would you?" then vote yes or no.' },
  { id: 'circuit-cypher', name: 'Circuit Cypher', version: '0.2.0', flagship: true, description: 'A robot rap battle: write rhyming bars, the robots perform, you vote.' },
  { id: 'what-you-didnt-know', name: "What, You Didn't Know That?", version: '0.1.0', flagship: true, description: 'A trivia gameshow: rising stakes, hidden answers, first to buzz in wins.' },
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
  buzzer: { correct: -1 },
}
