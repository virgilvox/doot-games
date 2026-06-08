/**
 * Running standings (P3): the cumulative leaderboard between rounds. Reuses
 * `scoreGame` over only the rounds revealed so far, so it folds the exact same
 * per-block aggregates (and the team roll-up) the final results use, no second
 * scoring path to keep in sync. Pure + deterministic; nothing durable.
 */
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import { type ScoreGameContext, scoreGame } from './derive'

/**
 * Score only rounds 0..throughIndex (inclusive). Slicing from 0 preserves each
 * round's original index, so the context's `inputsFor`/`answerKeys` (keyed by the
 * absolute round index) still line up. Returns the StandardResults (leaderboard +
 * teamLeaderboard + headline). A round with no aggregate contributes nothing, so a
 * make round before its vote simply doesn't move the scores.
 */
export function standingsThrough(
  plugin: GamePlugin,
  config: GameComposition,
  throughIndex: number,
  ctx: ScoreGameContext,
): StandardResults {
  const sliced: GameComposition = { ...config, rounds: config.rounds.slice(0, throughIndex + 1) }
  return scoreGame(plugin, sliced, ctx)
}
