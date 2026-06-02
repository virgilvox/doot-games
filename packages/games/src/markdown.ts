/**
 * Parse an LLM-friendly markdown spec into a game composition. The format is
 * documented in docs/markdown-games.md (the doc and this parser must agree).
 *
 * Shape:
 *   # Game Title
 *   theme: cyber                 (optional; a theme id)
 *
 *   ## guess                     (a round; the heading is the block kind)
 *   prompt: Who painted this?
 *   image: https://...           (optional)
 *   timer: 20                    (seconds, or "none")
 *   - Leonardo da Vinci (correct)
 *   - Michelangelo
 *
 * Each `##` heading starts a round of that block kind (guess/rate/poll/rank/
 * draw). `key: value` lines set scalar fields; `- item` lines are options /
 * items / categories. A `## draw` round with `vote: true` becomes draw-then-vote:
 * it expands to a draw round (gallery hidden) plus a drawvote round the room
 * votes on, with the best drawing topping the results. This is pure (no block/Vue
 * imports) so it can run anywhere; the editor validates the result against each
 * block's schema.
 */
import type { RoundInstance } from '@doot-games/sdk'

export interface ParsedGame {
  title: string
  themeId?: string
  rounds: RoundInstance[]
  warnings: string[]
}

interface RawRound {
  kind: string
  props: Record<string, string>
  items: Array<{ label: string; flags: string[] }>
}

function toTimer(v: string | undefined, fallback: number | null): number | null {
  if (v == null || v === '') return fallback
  if (/^(none|null|off|no)$/i.test(v.trim())) return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function slugId(label: string, index: number): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16)
  return `${base || 'item'}-${index}`
}

function parseScale(s: string | undefined):
  | { kind: 'numeric'; min: number; max: number; step: number }
  | { kind: 'levels'; levels: Array<{ label: string; value: number }> } {
  if (s) {
    const range = s.match(/^(\d+)\s*(?:-|to|–)\s*(\d+)$/i)
    if (range) {
      const min = Number(range[1])
      const max = Number(range[2])
      if (max > min) return { kind: 'numeric', min, max, step: 1 }
    }
    if (s.includes(',')) {
      const labels = s.split(',').map((x) => x.trim()).filter(Boolean)
      if (labels.length >= 2) {
        return { kind: 'levels', levels: labels.map((label, i) => ({ label, value: i + 1 })) }
      }
    }
  }
  return { kind: 'numeric', min: 1, max: 10, step: 1 }
}

function isTruthy(v: string | undefined): boolean {
  return v != null && /^(yes|true|on|1)$/i.test(v.trim())
}

function buildRound(raw: RawRound, warnings: string[]): RoundInstance[] {
  const p = raw.props
  const labels = raw.items.map((i) => i.label).filter(Boolean)
  switch (raw.kind) {
    case 'guess': {
      const options = (labels.length >= 2 ? labels : ['Option A', 'Option B']).map((label) => ({ label }))
      const correctIdx = raw.items.findIndex((i) => i.flags.includes('correct'))
      return [
        {
          block: 'guess',
          content: {
            subject: p.subject ?? '',
            prompt: p.prompt ?? 'Who is this?',
            image: p.image ?? '',
            timer: toTimer(p.timer, 20),
            options,
            correct: correctIdx >= 0 ? correctIdx : 0,
          },
        },
      ]
    }
    case 'poll': {
      const options = (labels.length >= 2 ? labels : ['Option A', 'Option B']).map((label) => ({ label }))
      return [
        {
          block: 'poll',
          content: { prompt: p.prompt ?? 'What do you think?', image: p.image ?? '', timer: toTimer(p.timer, null), options },
        },
      ]
    }
    case 'rank': {
      const items = (labels.length >= 2 ? labels : ['Option A', 'Option B']).map((label, i) => ({ id: slugId(label, i), label }))
      return [
        {
          block: 'rank',
          content: { prompt: p.prompt ?? 'Rank these', image: p.image ?? '', timer: toTimer(p.timer, null), items },
        },
      ]
    }
    case 'draw': {
      const aspect = Number(p.aspect)
      const asp = Number.isFinite(aspect) && aspect > 0 ? aspect : 0.7
      // `vote: true` turns a draw round into Sketch-and-Spot style play: the room
      // draws, then votes on the anonymized gallery. We emit the draw round with
      // the live gallery OFF (so the drawings stay a surprise) followed by a
      // drawvote round, which derives its gallery from the draw round (the
      // previous round, drawvote's default source). Best drawing wins points and
      // tops the results leaderboard.
      const wantsVote = isTruthy(p.vote)
      const draw: RoundInstance = {
        block: 'draw',
        content: {
          prompt: p.prompt ?? 'Draw the prompt!',
          image: p.image ?? '',
          timer: toTimer(p.timer, 60),
          aspect: asp,
          liveGallery: !wantsVote,
        },
      }
      if (!wantsVote) return [draw]
      return [
        draw,
        {
          block: 'drawvote',
          content: {
            prompt: p.voteprompt ?? 'Which drawing wins?',
            options: [],
            aspect: asp,
            timer: toTimer(p.votetimer, 30),
            hideUntilReveal: true,
          },
        },
      ]
    }
    case 'rate': {
      const catLabels = (p.categories ? p.categories.split(',').map((s) => s.trim()).filter(Boolean) : labels)
      const categories = (catLabels.length ? catLabels : ['Overall']).map((label, i) => ({ id: slugId(label, i), label }))
      return [
        {
          block: 'rate',
          content: {
            subject: p.subject ?? '',
            prompt: p.prompt ?? 'Rate this',
            image: p.image ?? '',
            timer: toTimer(p.timer, null),
            categories,
            scale: parseScale(p.scale),
          },
        },
      ]
    }
    default:
      warnings.push(`Unknown block kind "${raw.kind}" - skipped. Use one of: guess, rate, poll, rank, draw.`)
      return []
  }
}

export function parseMarkdownGame(md: string): ParsedGame {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let title = 'Imported game'
  let themeId: string | undefined
  const rounds: RoundInstance[] = []
  const warnings: string[] = []
  let cur: RawRound | null = null

  const flush = () => {
    if (!cur) return
    rounds.push(...buildRound(cur, warnings))
    cur = null
  }

  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    if (t.startsWith('## ')) {
      flush()
      cur = { kind: t.slice(3).trim().toLowerCase(), props: {}, items: [] }
      continue
    }
    if (t.startsWith('# ')) {
      flush()
      title = t.slice(2).trim() || title
      continue
    }
    const item = t.match(/^[-*]\s+(.+)$/)
    if (item && cur) {
      let label = (item[1] ?? '').trim()
      const flags: string[] = []
      const flag = label.match(/\(([^)]*)\)\s*$/)
      if (flag) {
        flags.push(...(flag[1] ?? '').split(',').map((s) => s.trim().toLowerCase()))
        label = label.slice(0, flag.index ?? label.length).trim()
      }
      cur.items.push({ label, flags })
      continue
    }
    const kv = t.match(/^([a-zA-Z][\w-]*)\s*:\s*(.*)$/)
    if (kv) {
      const key = (kv[1] ?? '').toLowerCase()
      const value = (kv[2] ?? '').trim()
      if (cur) cur.props[key] = value
      else if (key === 'theme') themeId = value.toLowerCase()
      continue
    }
  }
  flush()

  if (!rounds.length) warnings.push('No rounds found. Add at least one "## <block>" heading.')
  return { title, themeId, rounds, warnings }
}
