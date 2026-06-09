/**
 * The bridge from a block composition to what the engine and results need.
 * Everything here is derived generically from a game's blocks, no game writes
 * this by hand.
 */
import type {
  AnyBlock,
  DeriveSource,
  Distribution,
  GameComposition,
  GamePlugin,
  ResultsFragment,
  ScorePlayer,
  StandardResults,
  TeamScore,
} from '@doot-games/sdk'
import { type ShareInput, pickShare } from './shares'

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

/**
 * The engine's dynamic-timer callback (`LoadedGame.timerFor`): seconds for a
 * round given its EFFECTIVE content, the runtime-derived content when the engine
 * has one (a judge gallery built from the room's submissions), else the authored
 * round. Same per-block logic as `gameRounds`, so a static round's deadline is
 * unchanged, while a block whose `timerOf` scales with its content (vote-family
 * read-time scaling) gets a window sized to what the room actually has to read.
 * Timers-off still works: the host nulls every authored `content.timer`, the
 * derive carries that null through, and `timerOf` keeps null as untimed.
 */
export function buildTimerFor(
  plugin: GamePlugin,
  config: GameComposition,
): (index: number, runtimeContent: unknown) => number | null {
  return (index, runtimeContent) => {
    const inst = config.rounds[index]
    if (!inst) return null
    const block = getBlock(plugin, inst.block)
    const content = runtimeContent ?? inst.content
    const timer = block?.timerOf ? block.timerOf(content) : (block?.defaultTimer ?? null)
    return timer ?? null
  }
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
  /** P4B: the audience's votes per round, supplied only when "the crowd's votes
   *  count" is on; the vote-tallying blocks fold them as a capped bloc. */
  audienceVotesFor?: (index: number) => Map<string, unknown>
}

/**
 * The win headline, with co-crowning on a top-score tie: "Ann wins", "Ann & Bob
 * tie for the win", "3-way tie: Ann, Bob & Cal". Returns null when nobody scored
 * above 0 (so "Nobody wins at 0" never shows), letting the caller fall back to a
 * block headline. Pure + tested.
 */
export function crownHeadline(leaderboard?: Array<{ name: string; score: number }>): string | null {
  if (!leaderboard?.length) return null
  const max = Math.max(...leaderboard.map((e) => (typeof e.score === 'number' ? e.score : 0)))
  if (max <= 0) return null
  const winners = leaderboard.filter((e) => e.score === max).map((e) => e.name)
  if (winners.length === 1) return `${winners[0]} wins`
  if (winners.length === 2) return `${winners[0]} & ${winners[1]} tie for the win`
  return `${winners.length}-way tie: ${winners.slice(0, -1).join(', ')} & ${winners[winners.length - 1]}`
}

/**
 * Roll the per-player leaderboard into team totals, when the game is played in
 * teams. Pure: sums each scored player's points into their team and counts every
 * teamed player as a member (even a zero-scorer). Returns undefined when no player
 * has a team, so a non-team game is unchanged. This is the ONE place teams touch
 * scoring; blocks never see a team.
 */
export function teamLeaderboard(
  leaderboard: Array<{ id?: string; score: number }>,
  players: ScorePlayer[],
): TeamScore[] | undefined {
  // No per-player leaderboard means an unscored game (a poll/draw with no winner);
  // a team board of all-zeros would be noise, so there is nothing to roll up.
  if (!leaderboard.length) return undefined
  const teamOf = new Map<string, string>()
  for (const p of players) if (p.team) teamOf.set(p.id, p.team)
  if (teamOf.size === 0) return undefined
  const totals = new Map<string, { score: number; members: number }>()
  for (const p of players) {
    if (!p.team) continue
    const t = totals.get(p.team) ?? { score: 0, members: 0 }
    t.members++
    totals.set(p.team, t)
  }
  for (const e of leaderboard) {
    const team = e.id ? teamOf.get(e.id) : undefined
    if (!team) continue
    const t = totals.get(team)
    if (t) t.score += typeof e.score === 'number' ? e.score : 0
  }
  return [...totals.entries()]
    .map(([team, t]) => ({ team, score: t.score, members: t.members }))
    .sort((a, b) => b.score - a.score || a.team.localeCompare(b.team))
}

/** The win headline for team play, co-crowning a tie ("Red wins", "Red & Blue
 *  tie"). Null when no team scored above 0, so the caller falls back to the
 *  per-player crown. Pure + tested. */
export function teamCrownHeadline(teams?: TeamScore[]): string | null {
  if (!teams?.length) return null
  const max = Math.max(...teams.map((t) => t.score))
  if (max <= 0) return null
  const winners = teams.filter((t) => t.score === max).map((t) => t.team)
  if (winners.length === 1) return `${winners[0]} wins`
  if (winners.length === 2) return `${winners[0]} & ${winners[1]} tie`
  return `${winners.length}-way tie: ${winners.slice(0, -1).join(', ')} & ${winners[winners.length - 1]}`
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
        audienceVotesFor: ctx.audienceVotesFor,
      }),
    )
  }

  const leaderboard = fragments.find((f) => f.leaderboard)?.leaderboard
  // A custom-Results payload (e.g. a chain game's unspooled threads): pass the first
  // block that produced one through to the published results. The generic GameResults
  // ignores it; a game's `components.Results` reads it.
  const recap = fragments.find((f) => f.recap !== undefined)?.recap
  const awards = fragments.flatMap((f) => f.awards ?? [])
  const distributions = fragments.flatMap((f) => f.distributions ?? [])
  const stats = [
    { label: 'Players', value: ctx.players.length },
    ...fragments.flatMap((f) => f.stats ?? []),
  ]
  // Teams (when on): roll the per-player board into team totals. The per-player
  // board is kept too (the MVP is still per player); the headline crowns the team.
  const teams = teamLeaderboard(leaderboard ?? [], ctx.players)

  // Crown the winner(s) only when the top score is above zero (else "Nobody wins
  // at 0" reads oddly); co-crown a top-score tie; fall back to a block headline.
  // In team play the headline crowns the winning TEAM.
  const headline =
    teamCrownHeadline(teams) ??
    crownHeadline(leaderboard) ??
    (fragments.find((f) => f.headline)?.headline ?? 'The results are in')

  return { headline, leaderboard, teamLeaderboard: teams, awards, distributions, stats, recap }
}

/**
 * Resolve the source ("make") rounds a derived/assigned round consumes: the rounds
 * named by `RoundInstance.from` (default the immediately prior round), each carrying
 * that round's authored content, every player's input, the source round's withheld
 * answer key (host-side, via `getAnswerKey`), and a `render` that turns one
 * submission into votable text via its block's `toVoteText`. Shared by
 * `buildDeriveContent` (many->one judge rounds) and `buildAssignContent` (per-player
 * chains), so the two never drift. Pure.
 */
function buildSources(
  plugin: GamePlugin,
  config: GameComposition,
  index: number,
  inputsFor: (i: number) => Map<string, unknown>,
  getAnswerKey?: (i: number) => unknown,
): DeriveSource[] {
  const inst = config.rounds[index]
  const from = inst?.from ?? (index > 0 ? [index - 1] : [])
  return from
    .filter((i) => i >= 0 && config.rounds[i])
    .map((i) => {
      const srcInst = config.rounds[i] as GameComposition['rounds'][number]
      const srcBlock = getBlock(plugin, srcInst.block)
      return {
        index: i,
        content: srcInst.content,
        inputs: inputsFor(i),
        // The source round's withheld answer key (e.g. the faker round's
        // { fakerPid, word }), read host-side so a consuming round can use a hidden
        // fact without it ever reaching the relay. Undefined when there is none.
        answer: getAnswerKey?.(i),
        // Render a source submission to votable text via its block's toVoteText
        // (e.g. Mad Libs fills its template), else fall back to a `.text` field.
        render: (input: unknown) =>
          srcBlock?.toVoteText?.(srcInst.content, input) ??
          (input as { text?: string } | undefined)?.text ??
          '',
      }
    })
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
  /** Read a round's withheld answer key (host-side), so a judge round can learn a
   *  hidden fact about its make round (e.g. who the faker is). The host passes
   *  `room.answerKeyFor`, which returns a runtime-assigned/derived key if present.
   *  Omitted by callers that have no answer keys; sources then carry `answer:
   *  undefined`, which the common judge blocks (vote) ignore. */
  getAnswerKey?: (i: number) => unknown,
): (
  index: number,
  inputsFor: (i: number) => Map<string, unknown>,
) => { publish: unknown; answer?: unknown } | undefined {
  return (index, inputsFor) => {
    const inst = config.rounds[index]
    if (!inst) return undefined
    // Play-time variable: fill a field of this round from a prior collect round's
    // shares (resolved here, at advance, since the shares aren't known until then).
    // Gated on `fromShares`, so ordinary + two-phase rounds are unaffected.
    if (inst.fromShares) {
      const fs = inst.fromShares
      const srcIdx = fs.from ?? (index > 0 ? index - 1 : -1)
      const srcInputs = (srcIdx >= 0 ? inputsFor(srcIdx) : new Map()) as Map<string, ShareInput>
      const val = pickShare(srcInputs, fs.value ?? 'media', fs.pick ?? 'random', seededShuffle(`${seed}:${index}:shares`))
      const content = JSON.parse(JSON.stringify(inst.content ?? {})) as Record<string, unknown>
      if (val !== undefined && fs.field in content) content[fs.field] = val
      return { publish: content }
    }
    const block = getBlock(plugin, inst.block)
    if (!block?.derive) return undefined
    const sources = buildSources(plugin, config, index, inputsFor, getAnswerKey)
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
 * The votable text a judge round would build from one player's OWN make-round
 * submission, computed locally on that player's phone. Lets a judge player view
 * hide/disable the voter's own option (so nobody votes for themselves) WITHOUT
 * the public config ever carrying author info, which would deanonymize the
 * gallery. Mirrors `buildDeriveContent`'s source resolution + render exactly, so
 * the text matches the option/scenario the derive produced. Returns '' when this
 * is not a judge round, there is no source, or the player has no submission.
 */
export function ownMakeText(
  plugin: GamePlugin,
  config: GameComposition,
  judgeIndex: number,
  getInput: (sourceIndex: number) => unknown,
): string {
  const inst = config.rounds[judgeIndex]
  const block = inst ? getBlock(plugin, inst.block) : undefined
  if (!inst || !block?.derive) return ''
  const from = inst.from ?? (judgeIndex > 0 ? [judgeIndex - 1] : [])
  const srcIndex = from[0]
  if (srcIndex == null || srcIndex < 0) return ''
  const srcInst = config.rounds[srcIndex]
  if (!srcInst) return ''
  const myInput = getInput(srcIndex)
  if (myInput == null) return ''
  const srcBlock = getBlock(plugin, srcInst.block)
  return (
    srcBlock?.toVoteText?.(srcInst.content, myInput) ??
    (myInput as { text?: string } | undefined)?.text ??
    ''
  ).trim()
}

/**
 * Build the engine's `assignContent` callback from the blocks: for a round whose
 * block declares `assignContent`, run its pure assignment and return the SECRET
 * per-player content map plus the withheld answer. The engine publishes each
 * player's content to their own private address. Undefined for an ordinary round.
 *
 * Like `buildDeriveContent`, this resolves the round's source rounds (their inputs
 * keyed by player, via `RoundInstance.from`, default the previous round) and hands
 * them to the block as `sources`. The hidden-role case (faker) has no `from`, so
 * `sources` is empty and the assignment reads only the roster, exactly as before; a
 * per-player chain reads `sources[0].inputs` to hand each player a PRIOR round's
 * output. `getAnswerKey` mirrors `buildDeriveContent` so a source's withheld key is
 * available too (omitted by callers with no answer keys).
 */
export function buildAssignContent(
  plugin: GamePlugin,
  config: GameComposition,
  seed: string,
  getPlayers: () => ScorePlayer[],
  getAnswerKey?: (i: number) => unknown,
): (
  index: number,
  inputsFor: (i: number) => Map<string, unknown>,
) => { perPlayer: Record<string, unknown>; answer?: unknown } | undefined {
  return (index, inputsFor) => {
    const inst = config.rounds[index]
    if (!inst) return undefined
    const block = getBlock(plugin, inst.block)
    if (!block?.assignContent) return undefined
    const result = block.assignContent({
      content: inst.content,
      players: getPlayers(),
      shuffle: seededShuffle(`${seed}:assign:${index}`),
      sources: buildSources(plugin, config, index, inputsFor, getAnswerKey),
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
  /** P4B: the audience's votes for a round, supplied only when "the crowd's votes
   *  count" is on, so the published reveal tally matches the scored tally. */
  audienceVotesFor?: (index: number) => Map<string, unknown>,
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
      audienceVotes: audienceVotesFor?.(index),
    })
  }
}
