/**
 * Shared "timeout safety net" helper for two-phase judge blocks (vote/split/fibvote).
 *
 * When a make round (quip/fill) carries a `safetyAnswers` pool, an eligible player
 * who never submitted by lock still gets a deterministic canned answer in the
 * judge round's gallery, so there's no gap and nobody is stuck at zero. The caller
 * appends these entries before shuffling, flags the resulting option ids in the
 * withheld answer key (`answer.safety`), and the block's aggregate scores those at
 * half so a safety answer never out-earns a real one. See docs/flagship-games.md §6.
 */
import type { ScorePlayer } from '@doot-games/sdk'

/** A stable index in [0, n) from a player id, so a player's safety answer is
 *  deterministic (reconnect-safe) and varied across players, without Math.random. */
export function stableIndex(pid: string, n: number): number {
  let h = 0
  for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) >>> 0
  return h % n
}

/** The "make" source a judge round derives from, as the derive sees it. */
interface SafetySource {
  index: number
  content: unknown
  inputs: Map<string, unknown>
}

/**
 * One canned "safety" entry per eligible player who never submitted, drawn from
 * the make block's `safetyAnswers` pool. Returns [] when the pool is empty (the
 * feature is off). Append these to the judge's entries before shuffling.
 */
export function safetyEntries(
  source: SafetySource,
  players: ScorePlayer[],
): Array<{ pid: string; text: string; safety: true }> {
  const pool = ((source.content as { safetyAnswers?: string[] }).safetyAnswers ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
  if (!pool.length) return []
  const submitted = new Set(source.inputs.keys())
  const out: Array<{ pid: string; text: string; safety: true }> = []
  for (const p of players) {
    if (p.joinedAtIndex > source.index || submitted.has(p.id)) continue
    out.push({ pid: p.id, text: pool[stableIndex(p.id, pool.length)]!, safety: true })
  }
  return out
}
