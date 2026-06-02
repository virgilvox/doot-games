/**
 * The bridge from a block composition to what the engine and results need.
 * Everything here is derived generically from a game's blocks, no game writes
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

/** A 32-bit hash of a string seed (xfnv1a), to seed the PRNG below. */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

/** mulberry32: a tiny deterministic PRNG so every client shuffles identically. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A deterministic Fisher-Yates shuffle seeded by a string (room-stable order). */
export function seededShuffle(seed: string): <T>(items: T[]) => T[] {
  return <T>(items: T[]): T[] => {
    const rng = mulberry32(hashSeed(seed))
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[out[i], out[j]] = [out[j] as T, out[i] as T]
    }
    return out
  }
}

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
  // Only crown a winner when the top score is actually above zero, otherwise
  // "Nobody wins at 0" reads oddly; fall back to a block headline.
  const top = leaderboard?.[0]
  const headline =
    top && typeof top.score === 'number' && top.score > 0
      ? `${top.name} wins`
      : (fragments.find((f) => f.headline)?.headline ?? 'The results are in')

  return { headline, leaderboard, awards, distributions, stats }
}

/**
 * Build the engine's `deriveContent` callback from the blocks: for a round whose
 * block declares `derive`, gather its source rounds' inputs (`RoundInstance.from`,
 * default the previous round) and run the block's pure derivation. The engine
 * publishes the anonymized `publish` and withholds the `answer`.
 */
export function buildDeriveContent(
  plugin: GamePlugin,
  config: GameComposition,
  seed: string,
  getPlayers: () => ScorePlayer[],
): (
  index: number,
  inputsFor: (i: number) => Map<string, unknown>,
) => { publish: unknown; answer?: unknown } | undefined {
  return (index, inputsFor) => {
    const inst = config.rounds[index]
    if (!inst) return undefined
    const block = getBlock(plugin, inst.block)
    if (!block?.derive) return undefined
    const from = inst.from ?? (index > 0 ? [index - 1] : [])
    const sources = from
      .filter((i) => i >= 0 && config.rounds[i])
      .map((i) => {
        const srcInst = config.rounds[i] as GameComposition['rounds'][number]
        const srcBlock = getBlock(plugin, srcInst.block)
        return {
          index: i,
          content: srcInst.content,
          inputs: inputsFor(i),
          // Render a source submission to votable text via its block's toVoteText
          // (e.g. Mad Libs fills its template), else fall back to a `.text` field.
          render: (input: unknown) =>
            srcBlock?.toVoteText?.(srcInst.content, input) ??
            (input as { text?: string } | undefined)?.text ??
            '',
        }
      })
    const result = block.derive({
      content: inst.content,
      sources,
      players: getPlayers(),
      shuffle: seededShuffle(`${seed}:${index}`),
    })
    return { publish: result.publish, answer: result.answer }
  }
}

/**
 * Build the engine's `assignContent` callback from the blocks: for a round whose
 * block declares `assignContent` (the hidden-role pattern), run its pure
 * assignment over the current roster and return the SECRET per-player content map
 * plus the withheld answer (e.g. which player is the imposter). The engine
 * publishes each player's content to their own private address. Undefined for an
 * ordinary round.
 */
export function buildAssignContent(
  plugin: GamePlugin,
  config: GameComposition,
  seed: string,
  getPlayers: () => ScorePlayer[],
): (index: number) => { perPlayer: Record<string, unknown>; answer?: unknown } | undefined {
  return (index) => {
    const inst = config.rounds[index]
    if (!inst) return undefined
    const block = getBlock(plugin, inst.block)
    if (!block?.assignContent) return undefined
    const result = block.assignContent({
      content: inst.content,
      players: getPlayers(),
      shuffle: seededShuffle(`${seed}:assign:${index}`),
    })
    return { perPlayer: result.perPlayer, answer: result.answer }
  }
}

/**
 * Build the engine's `revealSummary` callback: for a round whose block declares
 * `revealSummary`, compute the public per-round payload from the effective
 * content (runtime-derived if present), this round's inputs, and its answer key.
 */
export function buildRevealSummary(
  plugin: GamePlugin,
  config: GameComposition,
  getPlayers: () => ScorePlayer[],
  runtimeContentFor: (index: number) => unknown | undefined,
  answerFor: (index: number) => unknown,
): (index: number, inputsFor: (i: number) => Map<string, unknown>) => unknown | undefined {
  return (index, inputsFor) => {
    const inst = config.rounds[index]
    if (!inst) return undefined
    const block = getBlock(plugin, inst.block)
    if (!block?.revealSummary) return undefined
    const content = runtimeContentFor(index) ?? inst.content
    return block.revealSummary({
      content,
      inputs: inputsFor(index),
      answer: answerFor(index),
      players: getPlayers(),
    })
  }
}
