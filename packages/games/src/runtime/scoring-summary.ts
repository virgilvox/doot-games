/**
 * Compose a player-facing "how scoring works" summary for a specific game from
 * its blocks. Each block declares an optional one-line `scoring` blurb; this
 * walks the game's rounds in play order and returns the DISTINCT blurbs, so a
 * `[guess, rate]` game shows the one guess line (rate scores nothing, so it has
 * no blurb) and a five-round all-guess game shows a single line. A game whose
 * rounds all score nothing (or a custom-flow game) returns an empty list, and
 * the caller can hide the section.
 */
import type { GameComposition, GamePlugin } from '@doot-games/sdk'
import { getBlock } from './derive'

export function scoringSummary(plugin: GamePlugin, config: GameComposition | null): string[] {
  if (!config) return []
  const lines: string[] = []
  const seen = new Set<string>()
  for (const inst of config.rounds) {
    const blurb = getBlock(plugin, inst.block)?.scoring
    if (blurb && !seen.has(blurb)) {
      seen.add(blurb)
      lines.push(blurb)
    }
  }
  return lines
}
