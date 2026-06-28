/**
 * Accuse block, the judge half of Faker. Its content is DERIVED at runtime from the
 * prior `faker` make round: it gathers every player's clue, attributes each to its
 * author, and presents them so the room can debate and then vote for who they think
 * was the faker (a roster vote, like Most Likely To, but the candidates are this
 * round's participants).
 *
 * It learns who the real faker is from the make round's WITHHELD answer key, passed
 * in via `DeriveContext.sources[0].answer` (the secret per-player primitive folds
 * `{ fakerPid, word }` into the faker round's answer key, host-side, so it never
 * touches a public relay address before reveal). The accuse round carries that key
 * forward as its own withheld answer so scoring and the reveal can read it.
 *
 * Scoring: an accuser who points at the real faker scores; the faker scores by
 * escaping (not being the room's top pick), rewarded for every voter it fooled. A
 * caught faker scores nothing. Self-accusations never count.
 */
import {
  type BlockResultsContext,
  type DeriveContext,
  type DerivedContent,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  promptText,
  z,
} from '@doot-games/sdk'
import type { FakerAnswer, FakerContent, FakerInput } from '../faker/block'
import { normalizeClue } from '../faker/block'
import AccuseHost from './AccuseHost.vue'
import AccusePlayer from './AccusePlayer.vue'
import AccuseReveal from './AccuseReveal.vue'

/** Points an accuser earns for fingering the real faker, and the faker's flat
 *  bonus for escaping (plus a per-fooled-voter bonus). */
export const ACCUSE_POINTS = 100

export const accuseClueSchema = z.object({
  pid: z.string(),
  name: z.string(),
  clue: z.string(),
})
export type AccuseClue = z.infer<typeof accuseClueSchema>

export const accuseContentSchema = z.object({
  prompt: promptText('Who is the faker?'),
  category: z.string().default(''),
  clues: z.array(accuseClueSchema).default([]),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(45)
    .describe('Seconds to vote. Turn off for an untimed round.'),
})
export type AccuseContent = z.infer<typeof accuseContentSchema>

export interface AccuseInput {
  /** The accused player's id. */
  choice: string
  /** The accused player's name, captured so they stay named even if they leave. */
  name: string
}

/** The withheld answer key carried forward from the faker round. */
export interface AccuseAnswer {
  fakerPid: string
  word: string
  /** Display names captured at derive time, so departed players stay named. */
  names: Record<string, string>
}

export interface AccuseRevealSummary {
  fakerPid: string
  fakerName: string
  word: string
  /** Whether the room's top pick was the real faker. */
  caught: boolean
  tallies: Array<{ pid: string; name: string; votes: number; isFaker: boolean }>
}

/**
 * Count accusations per accused pid, ignoring self-accusations (you can't accuse
 * yourself; the UI hides it, and this pure tally enforces it so a tampered client
 * can't either). A missing/empty choice is skipped.
 */
function tally(inputs: Map<string, AccuseInput>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const [pid, v] of inputs) {
    if (!v?.choice || v.choice === pid) continue
    counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1)
  }
  return counts
}

/** The room's top-voted suspect, or '' on a tie / no votes. A tie favors the faker
 *  (no single accused stands out), so a non-strict max does not count as caught. */
function topSuspect(counts: Map<string, number>): string {
  let top = ''
  let best = 0
  let tied = false
  for (const [pid, n] of counts) {
    if (n > best) {
      best = n
      top = pid
      tied = false
    } else if (n === best) {
      tied = true
    }
  }
  return best > 0 && !tied ? top : ''
}

export const accuseBlock = defineBlock<AccuseContent, AccuseInput>({
  kind: 'accuse',
  name: 'Accuse',
  scoring: 'Spot the faker to score; the faker scores by staying hidden.',
  contentSchema: accuseContentSchema,
  // Built at runtime from the faker round; the editor hides these and explains.
  derivedFields: ['clues', 'category'],
  defaultContent: () => ({ prompt: 'Who is the faker?', category: '', clues: [], timer: 45 }),
  defaultTimer: 45,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: '', name: '' }),
  isComplete: (_c, input) => input.choice !== '',
  PlayerInput: AccusePlayer,
  HostDisplay: AccuseHost,
  PlayerReveal: AccuseReveal,

  derive: (ctx: DeriveContext<AccuseContent>): DerivedContent<AccuseContent> => {
    const source = ctx.sources[0]
    const fakerContent = source?.content as FakerContent | undefined
    const srcAnswer = source?.answer as FakerAnswer | undefined
    const names: Record<string, string> = {}
    // Candidates are everyone who was eligible for the make round, NOT only those
    // who wrote a clue, so a faker who stays silent is still accusable (otherwise
    // not submitting would be an auto-escape). A non-submitter shows "(no clue)".
    const srcIndex = source?.index ?? 0
    const eligible = ctx.players.filter((p) => p.joinedAtIndex <= srcIndex)
    const entries: AccuseClue[] = eligible.map((p) => {
      const clue = normalizeClue((source?.inputs.get(p.id) as FakerInput | undefined)?.clue ?? '')
      names[p.id] = p.name
      return { pid: p.id, name: p.name, clue }
    })
    const clues = ctx.shuffle(entries)
    const fakerPid = srcAnswer?.fakerPid ?? ''
    const word = srcAnswer?.word ?? fakerContent?.word ?? ''
    return {
      publish: {
        prompt: ctx.content.prompt,
        category: fakerContent?.category ?? ctx.content.category,
        clues,
        timer: ctx.content.timer,
      },
      answer: { fakerPid, word, names } satisfies AccuseAnswer,
    }
  },

  revealSummary: (ctx: RevealContext<AccuseContent, AccuseInput>): AccuseRevealSummary => {
    const ans = ctx.answer as AccuseAnswer | undefined
    const fakerPid = ans?.fakerPid ?? ''
    const nameOf = (pid: string) =>
      ctx.players.find((p) => p.id === pid)?.name ?? ans?.names?.[pid] ?? 'Someone'
    const counts = tally(ctx.inputs)
    const top = topSuspect(counts)
    // Everyone who could be accused: the participants who gave a clue.
    const candidates = new Set<string>([...ctx.content.clues.map((c) => c.pid), ...counts.keys()])
    const tallies = [...candidates]
      .map((pid) => ({ pid, name: nameOf(pid), votes: counts.get(pid) ?? 0, isFaker: pid === fakerPid }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
    return {
      fakerPid,
      fakerName: nameOf(fakerPid),
      word: ans?.word ?? '',
      caught: !!fakerPid && top === fakerPid,
      tallies,
    }
  },

  aggregate: (ctx: BlockResultsContext<AccuseContent, AccuseInput>): ResultsFragment => {
    const scores = new Map<string, number>()
    const names = new Map<string, string>()
    // Names: captured map first, then live roster wins (so departed players keep a
    // real name and current ones stay accurate).
    for (const round of ctx.rounds) {
      const ans = ctx.answerFor(round.index) as AccuseAnswer | undefined
      if (ans?.names) for (const [pid, n] of Object.entries(ans.names)) names.set(pid, n)
    }
    for (const p of ctx.players) names.set(p.id, p.name)
    const nameOf = (pid: string) => names.get(pid) ?? 'Someone'

    const distributions = ctx.rounds.map((round) => {
      const ans = ctx.answerFor(round.index) as AccuseAnswer | undefined
      const fakerPid = ans?.fakerPid ?? ''
      const inputs = ctx.inputsFor(round.index) as Map<string, AccuseInput>
      const counts = tally(inputs)
      const top = topSuspect(counts)
      const caught = !!fakerPid && top === fakerPid

      // Accusers who pointed at the real faker score; never the faker, never a
      // self-accusation (already dropped in tally).
      let missed = 0
      for (const [pid, v] of inputs) {
        if (!v?.choice || v.choice === pid || pid === fakerPid) continue
        if (v.choice === fakerPid) scores.set(pid, (scores.get(pid) ?? 0) + ACCUSE_POINTS)
        else missed++
      }
      // The faker escapes by not being the room's top pick: a flat bonus plus a
      // cut for every non-faker voter it fooled. A caught faker scores nothing.
      if (fakerPid && !caught) {
        scores.set(fakerPid, (scores.get(fakerPid) ?? 0) + ACCUSE_POINTS + missed * ACCUSE_POINTS)
      }

      const bars = [...counts.entries()]
        .map(([pid, votes]) => ({
          label: nameOf(pid),
          count: votes,
          note: pid === fakerPid ? `the faker - ${votes} vote${votes === 1 ? '' : 's'}` : undefined,
        }))
        .sort((a, b) => b.count - a.count)
      return { title: round.content.category ? `The faker among "${round.content.category}"` : 'Who the room suspected', bars }
    })

    const pids = new Set<string>([...ctx.players.map((p) => p.id), ...scores.keys()])
    const leaderboard = [...pids]
      .map((pid) => ({ id: pid, name: nameOf(pid), score: scores.get(pid) ?? 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    const top = leaderboard[0]
    return {
      headline: top?.score ? `${top.name} wins` : undefined,
      leaderboard,
      distributions,
      stats: [{ label: 'Rounds', value: ctx.rounds.length }],
    }
  },
})
