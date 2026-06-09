/**
 * The flagship cover-art map: game id -> the shipped cover under
 * `apps/web/public/covers`. The ONE source of truth, used by GameCover (the
 * card art) and the web app's SEO composable (og:image), so the card and the
 * social share can never drift. Hand-made covers first; the rest are generated
 * by scripts/gen-covers.mjs (re-run it after an art change).
 */
export const FLAGSHIP_COVERS: Record<string, string> = {
  'quiz-or-die': '/covers/quiz-or-die.jpg',
  'circuit-cypher': '/covers/circuit-cypher.jpg',
  'open-mic': '/covers/open-mic.jpg',
  'type-the-answer': '/covers/type-the-answer.jpg',
  'would-you-rather': '/covers/would-you-rather.jpg',
  'tier-list': '/covers/tier-list.jpg',
  'over-under': '/covers/over-under.jpg',
  categories: '/covers/categories.jpg',
  survey: '/covers/survey.jpg',
  spectrum: '/covers/spectrum.jpg',
  wager: '/covers/wager.jpg',
  'story-chain': '/covers/story-chain.jpg',
  'doodle-chain': '/covers/doodle-chain.jpg',
  wavelength: '/covers/wavelength.jpg',
  bingo: '/covers/bingo.jpg',
  'call-it': '/covers/call-it.jpg',
}
