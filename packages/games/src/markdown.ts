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
 * draw/hivemind/mostlikely/ballpark). `key: value` lines set scalar fields; `- item` lines are options /
 * items / categories. A `## draw` round with `vote: true` becomes draw-then-vote:
 * it expands to a draw round (gallery hidden) plus a drawvote round the room
 * votes on, with the best drawing topping the results. This is pure (no block/Vue
 * imports) so it can run anywhere; the editor validates the result against each
 * block's schema.
 */
import { PROMPT_MAX, type RoundInstance } from '@doot-games/sdk'

export interface ParsedGame {
  title: string
  themeId?: string
  /** Game-level metadata from the spec header (above the first round). Optional;
   *  a save tool merges these with any explicit tool arguments. */
  description?: string
  /** 'private' (owner only) | 'unlisted' (anyone with the link) | 'public' (listed). */
  visibility?: 'private' | 'unlisted' | 'public'
  /** Whether others may copy/remix the game into their own editor. */
  forkable?: boolean
  /** A cover image URL (from upload_image), shown on cards + the detail page. */
  coverImage?: string
  /** Up to a handful of short discovery tags. */
  tags?: string[]
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

/** Parse a `safety: a | b | c` line into a list. Pipe-separated (not comma) so a
 *  canned answer can contain commas. Empty/missing -> []. */
function pipeList(v: string | undefined): string[] {
  if (!v) return []
  return v.split('|').map((s) => s.trim()).filter(Boolean)
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

/** Turn a blank id ("first_animal") into a default label ("First animal"). */
function prettify(id: string): string {
  const s = id.replace(/[_-]+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id
}

function buildRound(raw: RawRound, warnings: string[]): RoundInstance[] {
  const p = raw.props
  const labels = raw.items.map((i) => i.label).filter(Boolean)
  // Normalize the heading so multi-word kinds work however they're written
  // (`## most likely`, `## most-likely`, `## mostlikely` all map to one block).
  const kind = raw.kind.replace(/[\s_-]+/g, '')
  switch (kind) {
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
    case 'hivemind': {
      const ml = Number(p.maxlength)
      return [
        {
          block: 'hivemind',
          content: {
            prompt: p.prompt ?? 'Name something everyone would say.',
            placeholder: p.placeholder ?? '',
            maxLength: Number.isFinite(ml) && ml > 0 ? ml : 40,
            timer: toTimer(p.timer, 30),
          },
        },
      ]
    }
    case 'mostlikely': {
      return [
        {
          block: 'mostlikely',
          content: { prompt: p.prompt ?? 'Most likely to...', timer: toTimer(p.timer, 20) },
        },
      ]
    }
    case 'ballpark': {
      const answer = Number(p.answer)
      return [
        {
          block: 'ballpark',
          content: {
            subject: p.subject ?? '',
            prompt: p.prompt ?? 'How many?',
            image: p.image ?? '',
            unit: p.unit ?? '',
            answer: Number.isFinite(answer) ? answer : 0,
            timer: toTimer(p.timer, 30),
          },
        },
      ]
    }
    case 'buzzer': {
      const options = (labels.length >= 2 ? labels : ['Option A', 'Option B']).map((label) => ({ label }))
      const correctIdx = raw.items.findIndex((i) => i.flags.includes('correct'))
      const pts = Number(p.points)
      return [
        {
          block: 'buzzer',
          content: {
            subject: p.subject ?? '',
            prompt: p.prompt ?? 'What, you didn\'t know that?',
            image: p.image ?? '',
            timer: toTimer(p.timer, 20),
            options,
            correct: correctIdx >= 0 ? correctIdx : 0,
            points: Number.isFinite(pts) && pts > 0 ? pts : 100,
          },
        },
      ]
    }
    // Two-phase "make -> judge": a writing round whose answers become the next
    // round's content at runtime (see the editor's recipes). `## quip` collects a
    // free-text answer, then either the room votes for the best (Write & Vote) or,
    // with `truth:` set, players hunt the real answer among the lies (Lie Detector).
    case 'quip': {
      const ml = Number(p.maxlength)
      const make: RoundInstance = {
        block: 'quip',
        content: {
          prompt: p.prompt ?? 'Write your funniest answer.',
          placeholder: p.placeholder ?? '',
          maxLength: Number.isFinite(ml) && ml > 0 ? ml : 80,
          timer: toTimer(p.timer, 60),
          safetyAnswers: pipeList(p.safety),
        },
      }
      if (p.truth != null && p.truth.trim()) {
        return [
          make,
          {
            block: 'fibvote',
            content: { prompt: p.prompt ?? 'Which one is TRUE?', truth: p.truth.trim(), options: [], timer: toTimer(p.votetimer, 30), hideUntilReveal: true },
          },
        ]
      }
      return [
        make,
        {
          block: 'vote',
          content: { prompt: p.voteprompt ?? 'Which answer wins?', options: [], mode: 'field', timer: toTimer(p.votetimer, 30) },
        },
      ]
    }
    // `## fill` is a fill-in-the-blanks make round. Blanks are auto-extracted from
    // the `{placeholders}` in the template; a `- id: hint` line overrides a hint.
    // Then the room votes on the funniest result (Mad Lib & Vote), or with
    // `split: true` the room votes yes/no on each completed dilemma (Would You & Split).
    case 'fill': {
      const template = p.template ?? 'The {noun} went to the {place}.'
      const ids = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string)
      const hints = new Map<string, string>()
      for (const it of raw.items) {
        const m = it.label.match(/^(\w+)\s*[:=]\s*(.+)$/)
        if (m) hints.set(m[1] as string, (m[2] as string).trim())
      }
      const uniqueIds = [...new Set(ids.length ? ids : ['noun', 'place'])]
      const blanks = uniqueIds.map((id) => ({ id, label: hints.get(id) ?? prettify(id) }))
      const mlf = Number(p.maxlength)
      const maxLength = Number.isFinite(mlf) && mlf > 0 ? Math.min(mlf, 60) : 30
      const isSplit = isTruthy(p.split) || (p.mode ?? '').trim().toLowerCase() === 'split'
      const fill: RoundInstance = {
        block: 'fill',
        content: {
          subject: p.subject ?? '',
          prompt: p.prompt ?? (isSplit ? 'Finish the dilemma.' : 'Fill in the blanks (no peeking at the story!)'),
          template,
          blanks,
          maxLength,
          timer: toTimer(p.timer, 75),
          showTemplate: isSplit,
          safetyAnswers: pipeList(p.safety),
        },
      }
      if (isSplit) {
        return [
          fill,
          { block: 'split', content: { prompt: p.voteprompt ?? 'Would you? Vote yes or no on each', scenarios: [], timer: toTimer(p.votetimer, 40) } },
        ]
      }
      return [
        fill,
        { block: 'vote', content: { prompt: p.voteprompt ?? 'Funniest story wins', options: [], mode: 'field', timer: toTimer(p.votetimer, 30) } },
      ]
    }
    // `## faker` is the hidden-imposter game (faker -> accuse): everyone but one
    // secret faker is told the WORD; all give a one-word clue; then the room accuses.
    // The secret word is withheld from the big screen + the public config.
    case 'faker': {
      return [
        {
          block: 'faker',
          content: {
            category: p.category ?? 'Animals',
            word: p.word ?? 'Elephant',
            prompt: p.prompt ?? 'Give a one-word clue that proves you know the word, without giving it away.',
            timer: toTimer(p.timer, 45),
          },
        },
        {
          block: 'accuse',
          content: { prompt: p.voteprompt ?? 'Who is the faker?', category: '', clues: [], timer: toTimer(p.votetimer, 45) },
        },
      ]
    }
    default:
      warnings.push(
        `Unknown block kind "${raw.kind}" - skipped. Use one of: guess, poll, rank, rate, draw, buzzer, hivemind, mostlikely, ballpark, quip, fill, faker.`,
      )
      return []
  }
}

/** Map header `visibility:` (or `published:`) to the canonical enum, or undefined. */
function parseVisibility(v: string): ParsedGame['visibility'] {
  const s = v.trim().toLowerCase()
  if (s === 'public' || s === 'published' || s === 'listed') return 'public'
  if (s === 'unlisted' || s === 'link' || s === 'link-only') return 'unlisted'
  if (s === 'private' || s === 'hidden') return 'private'
  if (/^(yes|true|on)$/.test(s)) return 'public' // `published: yes`
  if (/^(no|false|off)$/.test(s)) return 'private'
  return undefined
}

export function parseMarkdownGame(md: string): ParsedGame {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let title = 'Imported game'
  let themeId: string | undefined
  let description: string | undefined
  let visibility: ParsedGame['visibility']
  let forkable: boolean | undefined
  let coverImage: string | undefined
  let tags: string[] | undefined
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
      let value = (kv[2] ?? '').trim()
      // Clamp prompts to the shared cap so a runaway markdown prompt can't
      // overflow the host stage (the same PROMPT_MAX the block schemas enforce).
      if ((key === 'prompt' || key === 'voteprompt') && value.length > PROMPT_MAX) {
        warnings.push(`A ${key} was shortened to ${PROMPT_MAX} characters (it was ${value.length}).`)
        value = value.slice(0, PROMPT_MAX)
      }
      if (cur) cur.props[key] = value
      // Header fields (above the first "## round") set game-level metadata.
      else if (key === 'theme') themeId = value.toLowerCase()
      else if (key === 'description' || key === 'desc') description = value.slice(0, 300)
      else if (key === 'visibility' || key === 'published') visibility = parseVisibility(value)
      else if (key === 'remixable' || key === 'forkable') forkable = isTruthy(value)
      else if (key === 'cover' || key === 'coverimage' || key === 'cover-image') coverImage = value
      else if (key === 'tags')
        tags = value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8)
      continue
    }
  }
  flush()

  if (!rounds.length) warnings.push('No rounds found. Add at least one "## <block>" heading.')
  return { title, themeId, description, visibility, forkable, coverImage, tags, rounds, warnings }
}
