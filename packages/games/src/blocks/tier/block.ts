/**
 * Tier block, the canonical "place a set of items into S/A/B/C/D bands" board. Every
 * player builds their own board on their phone (tap an item onto a tier); the host
 * shows the room's consensus board forming live. Optionally scored "match the room".
 *
 * Why it scales to a packed room: the board aggregates per ITEM, so 100 players
 * collapse into one fixed-size board (tiers x items). The crowd only shows up as
 * agreement strength and a vote count, never as per-player DOM. See logic.ts.
 *
 * No answer is withheld: the consensus emerges from the inputs themselves (like rank
 * and hivemind), so there is nothing to redact.
 */
import { isEligible } from '@doot-games/engine'
import {
  type BlockResultsContext,
  type Distribution,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  promptText,
  z,
} from '@doot-games/sdk'
import TierEditor from './TierEditor.vue'
import TierHost from './TierHost.vue'
import TierPlayer from './TierPlayer.vue'
import TierReveal from './TierReveal.vue'
import {
  DEFAULT_TIERS,
  type ItemConsensus,
  type TierDef,
  type TierItem,
  type TierPlacements,
  consensusBoard,
  mostDivisive,
  playerBoardScore,
  standout,
  TIER_BASE,
} from './logic'

export const tierDefSchema = z.object({
  label: z.string().min(1).max(18),
  color: z.string().default('').describe('Lane colour (a CSS colour; blank uses the default).'),
  sublabel: z.string().max(24).optional().describe('Optional descriptor beside the letter (e.g. "GOD TIER").'),
})
export const tierItemSchema = z.object({
  id: z.string().min(1).describe('Internal id (auto-filled).'),
  label: z.string().min(1).max(60),
  image: z.string().default('').describe('Optional picture for this item.'),
})

export const tierContentSchema = z.object({
  prompt: promptText('Tier these'),
  image: z.string().default('').describe('Optional picture shown with the prompt.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(60)
    .describe('Seconds to build your board. Turn off for an untimed round.'),
  tiers: z
    .array(tierDefSchema)
    .min(2)
    .max(8)
    .default(() => DEFAULT_TIERS.map((t) => ({ ...t })))
    .describe('The ranked bands, top to bottom (e.g. S, A, B, C, D). Rename and recolour freely.'),
  items: z.array(tierItemSchema).min(2).max(24).describe('The things the room places into tiers.'),
  scored: z
    .boolean()
    .default(false)
    .describe('Score players for guessing where the room lands. Off = just build the board.'),
  liveConsensus: z
    .boolean()
    .default(true)
    .describe('Show the board forming live as votes arrive. Off = keep it hidden until the reveal.'),
})
  // Placements key by item id, so duplicate ids would merge two items' votes and
  // collide their list keys. Every first-party generator de-dupes; this guards a
  // hand- or API-authored config (caught by validate_doot_game). Safe to refine:
  // tier uses a custom Editor, so the schema is only ever parsed, never introspected.
  .superRefine((c, ctx) => {
    const seen = new Set<string>()
    for (const it of c.items) {
      if (seen.has(it.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate item id "${it.id}" (each item needs a unique id).`, path: ['items'] })
        return
      }
      seen.add(it.id)
    }
  })
export type TierContent = z.infer<typeof tierContentSchema>
export interface TierInput {
  placements: TierPlacements
}

/** Public per-round reveal a phone reads to show "your board vs the room". */
export interface TierRevealSummary {
  tiers: TierDef[]
  board: Array<{ id: string; label: string; tier: number; agreement: number }>
}

function placementsOf(inputs: Map<string, TierInput | null | undefined>): TierPlacements[] {
  const out: TierPlacements[] = []
  for (const i of inputs.values()) if (i?.placements) out.push(i.placements)
  return out
}

export const tierBlock = defineBlock<TierContent, TierInput>({
  kind: 'tier',
  name: 'Tier List',
  // A solo block: it owns the whole round and runs the item-by-item show itself (the
  // board fills on the big screen, the room votes one item at a time), then advances.
  solo: true,
  contentSchema: tierContentSchema,
  defaultContent: (): TierContent => ({
    prompt: 'Where does it go?',
    image: '',
    timer: 20, // SECONDS PER ITEM (the block drives its own per-item countdown)
    tiers: DEFAULT_TIERS.map((t) => ({ ...t })),
    items: [
      { id: 'pizza', label: 'Pizza', image: '' },
      { id: 'tacos', label: 'Tacos', image: '' },
      { id: 'sushi', label: 'Sushi', image: '' },
      { id: 'salad', label: 'Salad', image: '' },
      { id: 'wings', label: 'Wings', image: '' },
      { id: 'pineapple-pizza', label: 'Pineapple on pizza', image: '' },
    ],
    scored: false,
    liveConsensus: true,
  }),
  defaultTimer: null,
  // The engine must NEVER auto-lock a solo round; the block holds it open and drives
  // its own per-item timing. (`content.timer` is repurposed as seconds-per-item.)
  timerOf: () => null,
  emptyInput: (): TierInput => ({ placements: {} }),
  // Complete once every item has a VALID tier (a real in-range band), so an untouched
  // submit does not silently dump everything into the top band, and a forged NaN /
  // out-of-range index does not read as "placed" while the tally drops it.
  isComplete: (c, input) =>
    c.items.every((it) => {
      const t = input?.placements?.[it.id]
      return typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < c.tiers.length
    }),
  PlayerInput: TierPlayer,
  HostDisplay: TierHost,
  PlayerReveal: TierReveal,
  Editor: TierEditor,

  revealSummary: (ctx: RevealContext<TierContent, TierInput>): TierRevealSummary => {
    const board = consensusBoard(ctx.content.items, ctx.content.tiers.length, placementsOf(ctx.inputs))
    return {
      tiers: ctx.content.tiers,
      board: board.map((c) => ({ id: c.id, label: c.label, tier: c.tier, agreement: c.agreement })),
    }
  },

  aggregate: (ctx: BlockResultsContext<TierContent, TierInput>): ResultsFragment => {
    const anyScored = ctx.rounds.some((r) => r.content.scored)
    const totals = ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      joinedAtIndex: p.joinedAtIndex,
      score: 0,
      hits: 0,
    }))
    const byId = new Map(totals.map((t) => [t.id, t]))
    const distributions: Distribution[] = []
    let divisive: ItemConsensus | null = null
    let crown: { item: ItemConsensus; tier: TierDef } | null = null
    let placements = 0
    let totalItems = 0

    for (const { index, content } of ctx.rounds) {
      const inputs = ctx.inputsFor(index) as Map<string, TierInput>
      const tierCount = content.tiers.length
      totalItems += content.items.length
      const board = consensusBoard(content.items, tierCount, placementsOf(inputs))

      const placed = board.filter((c) => c.tier >= 0)
      if (placed.length) {
        const sorted = [...placed].sort((a, b) => a.tier - b.tier || b.agreement - a.agreement)
        distributions.push({
          title: content.prompt,
          bars: sorted.map((c) => ({
            label: c.label,
            count: tierCount - c.tier, // top tier = fullest bar
            max: tierCount,
            display: content.tiers[c.tier]?.label ?? '',
            note: `${Math.round(c.agreement * 100)}% agree`,
            correct: c.tier === 0,
          })),
        })
      }

      const d = mostDivisive(board)
      if (d && (!divisive || d.controversy > divisive.controversy)) divisive = d
      const s = standout(board)
      if (s && (!crown || s.agreement > crown.item.agreement)) crown = { item: s, tier: content.tiers[s.tier] as TierDef }
      for (const c of board) placements += c.total

      if (content.scored) {
        for (const [pid, input] of inputs) {
          const t = byId.get(pid)
          if (!t || !isEligible(t.joinedAtIndex, index)) continue
          const { points, hits } = playerBoardScore(board, input?.placements ?? {})
          t.score += Math.round(TIER_BASE * points)
          t.hits += hits
        }
      }
    }

    const awards: NonNullable<ResultsFragment['awards']> = []
    if (crown) {
      awards.push({
        label: `Room agrees: ${crown.tier.label} tier`,
        subject: crown.item.label,
        value: `${Math.round(crown.item.agreement * 100)}%`,
        ...(crown.item.image ? { image: crown.item.image } : {}),
      })
    }
    // Don't name the same subject as both the crown and the divisive award (across
    // multi-round games an id or label can repeat); compare by both.
    if (divisive && divisive.id !== crown?.item.id && divisive.label !== crown?.item.label) {
      awards.push({
        label: 'Most divisive',
        subject: divisive.label,
        value: `${Math.round(divisive.controversy * 100)}% split`,
        ...(divisive.image ? { image: divisive.image } : {}),
      })
    }

    totals.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    const result: ResultsFragment = {
      headline: 'The board is set',
      awards,
      ...(distributions.length ? { distributions } : {}),
      stats: [
        ctx.rounds.length > 1
          ? { label: 'Boards', value: ctx.rounds.length }
          : { label: 'Items', value: totalItems },
        { label: 'Placements', value: placements },
      ],
    }
    if (anyScored && totals.some((t) => t.score > 0)) {
      result.leaderboard = totals.map((t) => ({ id: t.id, name: t.name, score: t.score, detail: `${t.hits} matched` }))
    }
    return result
  },
})

export type { TierDef, TierItem, TierPlacements, ItemConsensus }
