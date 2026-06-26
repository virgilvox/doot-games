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
import { PROMPT_MAX, type DeckUse, type RoundInstance } from '@doot-games/sdk'
import { parseBoard } from './blocks/survey/logic'
import { DEFAULT_TIERS } from './blocks/tier/logic'
import { parseSheet } from './runtime/sheet'

// Re-export the pure spreadsheet parser so server code (which can't import the package
// root — it pulls in `.vue` blocks) can reach it via this server-safe subpath.
export { parseSheet } from './runtime/sheet'

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
  /** Content decks (`## deck <id>` blocks), keyed by id, referenced by rounds'
   *  `draw`/`bindings`/`pool`. Resolved at play time. */
  decks?: Record<string, DeckUse>
  rounds: RoundInstance[]
  warnings: string[]
}

interface RawRound {
  kind: string
  props: Record<string, string>
  items: Array<{ label: string; flags: string[] }>
  /** For a `## deck <id>` block: the deck's id and its raw CSV/TSV lines (header
   *  + rows), parsed by parseSheet at flush. */
  id?: string
  raw?: string[]
  /** Accumulated `bind:` lines on a round (the kv map can't hold duplicates). */
  binds?: string[]
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
            audio: p.audio ?? '',
            timer: toTimer(p.timer, 20),
            options,
            correct: correctIdx >= 0 ? correctIdx : 0,
          },
        },
      ]
    }
    case 'wager': {
      // High-stakes trivia: like guess, but each player bets a tier (the bet is a
      // play-time choice, so the author just sets the question + options).
      const options = (labels.length >= 2 ? labels : ['Option A', 'Option B']).map((label) => ({ label }))
      const correctIdx = raw.items.findIndex((i) => i.flags.includes('correct'))
      return [
        {
          block: 'wager',
          content: {
            subject: p.subject ?? '',
            prompt: p.prompt ?? 'Bet on it: which is true?',
            image: p.image ?? '',
            timer: toTimer(p.timer, 25),
            options,
            correct: correctIdx >= 0 ? correctIdx : 0,
          },
        },
      ]
    }
    case 'answer': {
      // Type-the-answer trivia. Accepted answers come from an `answer:`/`answers:`
      // line (synonyms split on | or ;) or, failing that, the list items. `fuzzy`
      // (default on) forgives small typos/accents.
      const raw2 = (p.answers ?? p.answer ?? '').trim()
      const fromProp = raw2 ? raw2.split(/[|;]/).map((s) => s.trim()).filter(Boolean) : []
      const answers = fromProp.length ? fromProp : labels
      if (!answers.length) warnings.push('A "## answer" round needs an answer (e.g. "answer: Paris | NYC" or a list item).')
      return [
        {
          block: 'answer',
          content: {
            subject: p.subject ?? '',
            prompt: p.prompt ?? 'What is the answer?',
            image: p.image ?? '',
            audio: p.audio ?? '',
            answers: answers.length ? answers : ['Answer'],
            fuzzy: p.fuzzy != null ? isTruthy(p.fuzzy) : true,
            timer: toTimer(p.timer, 30),
          },
        },
      ]
    }
    case 'survey': {
      // Family Feud: the board is the list items, each "Answer:points" (points
      // optional -> rank-scored). Reuses the block's parser so the two agree.
      // Scored at reveal; the board is the withheld answer key.
      const board = parseBoard((labels.length ? labels : ['Answer A:10', 'Answer B:5']).join('|'))
      const gc = Number(p.guesses)
      return [
        {
          block: 'survey',
          content: {
            prompt: p.prompt ?? 'Name a popular answer.',
            answers: board,
            guessCount: Number.isFinite(gc) && gc > 0 ? Math.min(8, gc) : 3,
            timer: toTimer(p.timer, 45),
          },
        },
      ]
    }
    case 'categories': {
      // Scattergories: a `letter:` + the categories as list items. Everyone fills
      // one answer per category; valid + unique answers score (computed at reveal).
      const cats = (labels.length ? labels : ['An animal', 'A food', 'A city']).map((label, i) => ({ id: `c${i}`, label }))
      const letter = ((p.letter ?? 'C').trim().slice(0, 1) || 'C').toUpperCase()
      return [
        {
          block: 'categories',
          content: { prompt: p.prompt ?? 'Categories', letter, categories: cats, timer: toTimer(p.timer, 120) },
        },
      ]
    }
    case 'spectrum': {
      // A dial between two poles (`left:` / `right:`); the room places the subject
      // and scores by closeness to the consensus. No items.
      return [
        {
          block: 'spectrum',
          content: {
            prompt: p.prompt ?? 'Where does it land?',
            leftLabel: p.left ?? 'Disagree',
            rightLabel: p.right ?? 'Agree',
            timer: toTimer(p.timer, 30),
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
    case 'tier': {
      // `- item` lines are the things to tier; an optional `tiers: S | A | B | C | D`
      // names the bands (else the classic S-D defaults). Clamp to the schema max so a
      // long list validates + saves instead of producing invalid content.
      const itemLabels = labels.length >= 2 ? labels : ['Pizza', 'Tacos']
      if (itemLabels.length > 24) warnings.push(`A tier round takes at most 24 items; using the first 24 of ${itemLabels.length}.`)
      const items = itemLabels.slice(0, 24).map((label, i) => ({
        id: slugId(label, i),
        label,
        image: '',
      }))
      const tierLabels = pipeList(p.tiers)
      const tiers =
        tierLabels.length >= 2
          ? tierLabels.slice(0, 8).map((label, i) => ({ label, color: DEFAULT_TIERS[i % DEFAULT_TIERS.length]!.color }))
          : DEFAULT_TIERS.map((t) => ({ ...t }))
      return [
        {
          block: 'tier',
          content: {
            prompt: p.prompt ?? 'Tier these',
            image: p.image ?? '',
            timer: toTimer(p.timer, null),
            tiers,
            items,
            scored: isTruthy(p.scored),
            liveConsensus: !isTruthy(p.hideboard),
          },
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
          image: p.image ?? '',
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
        `Unknown block kind "${raw.kind}" - skipped. Use one of: guess, answer, wager, poll, rank, tier, rate, draw, buzzer, hivemind, mostlikely, ballpark, categories, survey, spectrum, quip, fill, faker.`,
      )
      return []
  }
}

/** Build a content deck from a `## deck <id>` block: either a `link:`/`ref:` line
 *  referencing a durable library deck, or raw CSV/TSV rows to inline. */
function buildDeck(cur: RawRound, decks: Record<string, DeckUse>, warnings: string[]): void {
  const id = (cur.id ?? '').trim()
  if (!id) {
    warnings.push('A "## deck" needs an id, e.g. "## deck trivia".')
    return
  }
  const raw = cur.raw ?? []
  // A `link: <deckId>` (or `ref:`) line references a library deck instead of inlining
  // rows; it resolves to inline at serve time. Everything else is treated as CSV.
  const linkLine = raw.find((l) => /^\s*(link|ref)\s*:/i.test(l))
  if (linkLine) {
    const ref = (linkLine.slice(linkLine.indexOf(':') + 1) ?? '').trim()
    if (ref) decks[id] = { ref }
    else warnings.push(`Deck "${id}" has a "link:" with no deck id.`)
    return
  }
  const sheet = parseSheet(raw.join('\n'))
  if (!sheet.columns.length || !sheet.rows.length) {
    warnings.push(`Deck "${id}" has no usable rows (needs a header line + at least one row).`)
    return
  }
  for (const e of sheet.errors) warnings.push(`Deck "${id}": ${e}`)
  decks[id] = { inline: { columns: sheet.columns, rows: sheet.rows } }
}

/** Attach a round's `draw`/`bindings`/`pool` from its `draw:`/`bind:`/`pool:` lines.
 *  Only single-round blocks are deck-backed for now (two-phase + decks is later). */
function attachDeckFields(cur: RawRound, built: RoundInstance[], warnings: string[]): void {
  const has = cur.props.draw || cur.props.pool || (cur.binds?.length ?? 0) > 0
  if (!has) return
  if (built.length !== 1) {
    warnings.push(`Deck fields (draw/bind/pool) on "## ${cur.kind}" are only supported on single-round blocks for now.`)
    return
  }
  const r = built[0]!
  const draw = Number.parseInt(cur.props.draw ?? '', 10)
  if (Number.isFinite(draw) && draw > 0) r.draw = draw
  if (cur.props.pool) r.pool = { deck: cur.props.pool.trim() }
  const bindings: Record<string, { deck: string; column: string }> = {}
  for (const b of cur.binds ?? []) {
    const m = b.match(/^(.+?)\s*=\s*([\w-]+)\.([\w-]+)\s*$/)
    // Normalize the column to parseSheet's slug (lowercased header) so "Country"
    // binds to the "country" key. The deck id stays verbatim (the `## deck <id>`).
    if (m) bindings[(m[1] ?? '').trim()] = { deck: m[2] ?? '', column: (m[3] ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_') }
    else warnings.push(`Could not parse "bind: ${b}" (use: bind: field = deckId.column).`)
  }
  if (Object.keys(bindings).length) r.bindings = bindings
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
  const decks: Record<string, DeckUse> = {}
  const warnings: string[] = []
  let cur: RawRound | null = null

  const flush = () => {
    if (!cur) return
    if (cur.kind === 'deck') {
      buildDeck(cur, decks, warnings)
    } else {
      const built = buildRound(cur, warnings)
      attachDeckFields(cur, built, warnings)
      rounds.push(...built)
    }
    cur = null
  }

  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    if (t.startsWith('## ')) {
      flush()
      const head = t.slice(3).trim()
      // `## deck <id>` starts a content deck; its following raw lines are its CSV/TSV.
      const deck = head.match(/^deck\s+(.+)$/i)
      cur = deck ? { kind: 'deck', id: (deck[1] ?? '').trim(), props: {}, items: [], raw: [] } : { kind: head.toLowerCase(), props: {}, items: [] }
      continue
    }
    if (t.startsWith('# ')) {
      flush()
      title = t.slice(2).trim() || title
      continue
    }
    // Inside a `## deck` block, every non-heading line is a raw CSV/TSV row.
    if (cur?.kind === 'deck') {
      cur.raw!.push(t)
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
      // `bind:` lines accumulate (a round can bind several fields); others are scalar props.
      if (cur && key === 'bind') (cur.binds ??= []).push(value)
      else if (cur) cur.props[key] = value
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
  return {
    title,
    themeId,
    description,
    visibility,
    forkable,
    coverImage,
    tags,
    ...(Object.keys(decks).length ? { decks } : {}),
    rounds,
    warnings,
  }
}
