/**
 * The bridge from a block composition to what the engine and results need.
 * Everything here is derived generically from a game's blocks — no game writes
 * this by hand.
 */
import type {
  AnyBlock,
  Distribution,
  GameComposition,
  GamePlugin,
  ResultsFragment,
  ScorePlayer,
  StandardResults,
} from '@doot-games/sdk'

/** VoteBars-ready bar (label/value/max/display/note). */
export interface RenderBar {
  label: string
  value: number
  max: number
  display?: string
  note: string
}

/**
 * Map a results distribution to VoteBars input. By default a bar's `count` is a
 * vote tally filled against the distribution total; a block may override `max`
 * (e.g. a ranking weight against item count), `display` (e.g. "#1" / "B"), and
 * `note`.
 */
export function distributionToBars(distribution: Distribution): RenderBar[] {
  const total = distribution.bars.reduce((sum, b) => sum + b.count, 0) || 1
  return distribution.bars.map((b) => ({
    label: b.label,
    value: b.count,
    max: b.max ?? total,
    display: b.display,
    note: b.note ?? `${b.count} vote${b.count === 1 ? '' : 's'}`,
  }))
}

export function getBlock(plugin: GamePlugin, kind: string): AnyBlock | undefined {
  return plugin.blocks.find((b) => b.kind === kind)
}

/** Per-round timing the engine needs to drive deadlines. */
export function gameRounds(
  plugin: GamePlugin,
  config: GameComposition,
): Array<{ timer: number | null }> {
  return config.rounds.map((inst) => {
    const block = getBlock(plugin, inst.block)
    const timer = block?.timerOf ? block.timerOf(inst.content) : (block?.defaultTimer ?? null)
    return { timer: timer ?? null }
  })
}

/** The publish-safe composition: each round's content run through its block's redactor. */
export function redactGameConfig(plugin: GamePlugin, config: GameComposition): GameComposition {
  return {
    ...config,
    rounds: config.rounds.map((inst) => {
      const block = getBlock(plugin, inst.block)
      return {
        block: inst.block,
        content: block?.redactContent ? block.redactContent(inst.content) : inst.content,
      }
    }),
  }
}

/** Answer key per round index, withheld until that round's reveal. */
export function gameAnswerKeys(
  plugin: GamePlugin,
  config: GameComposition,
): Record<number, unknown> {
  const keys: Record<number, unknown> = {}
  config.rounds.forEach((inst, index) => {
    const block = getBlock(plugin, inst.block)
    if (block?.answerOf) keys[index] = block.answerOf(inst.content)
  })
  return keys
}

export interface ScoreGameContext {
  inputsFor: (index: number) => Map<string, unknown>
  players: ScorePlayer[]
  answerKeys: Record<number, unknown>
}

/** Group rounds by block, run each block's aggregate, and merge the fragments. */
export function scoreGame(
  plugin: GamePlugin,
  config: GameComposition,
  ctx: ScoreGameContext,
): StandardResults {
  const byKind = new Map<string, Array<{ index: number; content: unknown }>>()
  config.rounds.forEach((inst, index) => {
    const arr = byKind.get(inst.block) ?? []
    arr.push({ index, content: inst.content })
    byKind.set(inst.block, arr)
  })

  const fragments: ResultsFragment[] = []
  for (const block of plugin.blocks) {
    const rounds = byKind.get(block.kind)
    if (!rounds?.length || !block.aggregate) continue
    fragments.push(
      block.aggregate({
        rounds,
        inputsFor: ctx.inputsFor,
        answerFor: (i) => ctx.answerKeys[i],
        players: ctx.players,
      }),
    )
  }

  const leaderboard = fragments.find((f) => f.leaderboard)?.leaderboard
  const awards = fragments.flatMap((f) => f.awards ?? [])
  const distributions = fragments.flatMap((f) => f.distributions ?? [])
  const stats = [
    { label: 'Players', value: ctx.players.length },
    ...fragments.flatMap((f) => f.stats ?? []),
  ]
  const headline = leaderboard?.[0]
    ? `${leaderboard[0].name} wins`
    : (fragments.find((f) => f.headline)?.headline ?? 'The results are in')

  return { headline, leaderboard, awards, distributions, stats }
}
