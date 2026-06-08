/**
 * "Connect with Claude": an OAuth-protected Model Context Protocol (MCP) server.
 *
 * A user links their Doot account inside claude.ai (or Claude Code) and Claude
 * builds games for them. Doot runs NO inference; it exposes deterministic tools
 * over the server-safe markdown format, and a `save_game` tool that writes the
 * game straight to the signed-in user's account. Auth is OAuth 2.1 via the
 * better-auth `mcp` plugin (see server/utils/auth.ts and the /.well-known routes);
 * `withMcpAuth` validates the bearer token and hands us the user. No keys stored,
 * no inference billed.
 *
 * Transport: stateless Streamable HTTP (JSON-RPC 2.0 over POST). An unauthenticated
 * POST gets a 401 with a WWW-Authenticate pointing at the protected-resource
 * metadata, which is how Claude discovers the OAuth flow.
 */
import { gameCatalog } from '@doot-games/games/catalog'
import { parseMarkdownGame, parseSheet } from '@doot-games/games/markdown'
import { withMcpAuth } from 'better-auth/plugins'

const SERVER_INFO = { name: 'doot', title: 'Doot', version: '0.1.0' }
const DEFAULT_PROTOCOL = '2025-06-18'
const BASE = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
const KNOWN_THEMES = new Set(['doot', 'cutesie', 'cyber', 'professional', 'playful'])

/** Conventional deck columns for a typed remixable game, surfaced when an agent tries the
 *  single-column csv path on a multi-column game (it must save_deck + pass a deckId). */
const POOL_COLUMNS: Record<string, string> = {
  'fib-finder': 'question, truth',
  ballpark: 'prompt, answer (+ optional unit)',
  'what-you-didnt-know': 'prompt, options (|-separated), correct (1-based index)',
  faker: 'category, word',
  'mad-libs': 'template (with {token} blanks)',
  'quiz-or-die': 'question, options (|-separated), correct (1-based index), optional category',
}

// Per-user write throttle for the write tools (save_game/upload_image). /mcp is
// not covered by the per-IP middleware, and per-user is the right key here since
// all Claude traffic can share egress IPs. In-memory fixed window, fine for the
// single-instance deploy. Reads are cheap and stay unthrottled.
const writeWindow = new Map<string, { count: number; resetAt: number }>()
function writeAllowed(userId: string): boolean {
  const now = Date.now()
  const b = writeWindow.get(userId)
  if (!b || b.resetAt <= now) {
    if (writeWindow.size > 5000) for (const [k, v] of writeWindow) if (v.resetAt <= now) writeWindow.delete(k)
    writeWindow.set(userId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  b.count++
  return b.count <= 30
}

const FORMAT_GUIDE = `Write a Doot party game as a Markdown spec, then validate_doot_game and save_game to add it to the user's Doot account. Output ONLY the spec when you show it, no code fences.

== SHAPE ==
# Game Title
theme: doot                 (optional; one of: doot, cutesie, cyber, professional, playful)
description: A one-liner.    (optional; shown on cards + the detail page, <=300 chars)
visibility: private         (optional; private | unlisted | public. Default private. "public" lists it in discovery; "unlisted" = anyone with the link)
remixable: no               (optional; yes/no. yes = others may copy it into their own editor)
cover: https://...          (optional; a cover image URL - first host one with upload_image, then put the returned URL here. See COVER IMAGE)
tags: trivia, party         (optional; up to 8 short comma-separated tags)

Then one or more rounds. Each round is a "## <block>" heading, then "key: value" lines and "- item" lines.
"timer:" is seconds, or "none". "image:" is an optional image URL shown with the prompt (host it with upload_image first).
Header fields above also work as save_game / update_game / set_game_meta arguments, which OVERRIDE the spec header.

== STANDALONE BLOCKS (one heading = one round) ==
* "## guess": multiple choice, ONE right answer (scored: faster correct = more). Fields: subject (optional), prompt, image, "audio:" (a clip URL, for Name That Tune; the big screen plays it), timer (default 20). List 2+ "- choice"; mark the right one "(correct)".
* "## answer": type-the-answer trivia (no choices; players TYPE it). Fields: subject, prompt, image, "audio:" (a clip URL for Name That Tune), timer (default 30), "answers:" (the accepted answer; add synonyms split by " | ", e.g. "New York City | NYC"), "fuzzy:" (default yes, forgives typos/accents; set "no" for a strict match). Hidden until reveal; correct-only scoring. No "- " items (or use one "- item" as the answer).
* "## buzzer": first-correct trivia, fastest right answer scores most. Fields: subject, prompt, image, timer (default 20), "points:" (worth, default 100; raise each round to escalate). 2+ "- choice"; "(correct)" marks the answer.
* "## poll": opinion, no right answer. Fields: prompt, image, timer (default none). 2+ "- choice".
* "## rank": players drag items into order; a consensus ranking is shown. Fields: prompt, image, timer (default none). 2+ "- item".
* "## rate": score subjects on a scale. Fields: subject, prompt, image, timer, "categories: A, B, C", "scale:" (a range like "1-10", or labels like "F, D, C, B, A").
* "## draw": players sketch the prompt. Fields: prompt, image, timer (default 60). Add "vote: true" for draw-then-vote (the room votes the best drawing). With vote: "voteprompt:", "votetimer:" (default 30).
* "## hivemind": free-text answer, score by MATCHING the crowd ("read the room"). Fields: prompt, timer (default 30). Use prompts with an obvious popular answer ("Name a color of the rainbow"). No "- " items.
* "## categories": Scattergories. A letter + a few categories; players type one answer each, and a VALID (starts with the letter) + UNIQUE (nobody else said it) answer scores. Fields: "letter:" (one letter), timer (default 120). List the categories as "- An animal", "- A food", etc.
* "## survey": Family Feud. A hidden board of top answers; players name as many as they can and each board answer they find scores its points. Fields: prompt, "guesses:" (how many tries, default 3), timer (default 45). List the board as "- Answer:points" (e.g. "- Pepperoni:35"); points are optional (bare answers get rank-based points, first = highest).
* "## spectrum": a dial between two poles; the room places the subject and scores by landing near the consensus ("read the room"). Fields: prompt (the subject/hot take), "left:" + "right:" (the two pole labels, default Disagree/Agree), timer (default 30). No "- " items.
* "## mostlikely": the room votes a PLAYER from the lobby ("most likely to..."). Fields: prompt, timer (default 20). Options ARE the players, so no "- " items. Keep it party-safe.
* "## ballpark": numeric trivia, closest guess wins. Fields: subject, prompt, image, "answer:" (the true NUMBER, hidden until reveal), "unit:" (optional: km, %, years), timer (default 30). No "- " items. Use facts nobody knows exactly.

== TWO-PHASE BLOCKS (one heading expands to TWO rounds: a "make" round, then a "judge" round) ==
How they work: the make round collects everyone's PRIVATE submission; the judge round is built AT RUNTIME from those submissions, anonymized and shuffled, for the room to vote on. You never write the judge options yourself - they ARE the players' answers. A player can't vote for their own.
* "## quip": everyone writes an answer, then the room votes the best (Write & Vote / Quiplash). Fields: prompt, timer (default 60), maxlength, "voteprompt:", "votetimer:" (default 30). Add "image:" (a URL) to make it CAPTION THIS: players caption the image, then vote the funniest.
   - Add "truth: <the real answer>" => Lie Detector (Fibbage): players write a believable LIE to your trivia question (the prompt); the room hunts the one TRUE answer mixed in. Score by fooling others AND by finding the truth.
   - Optional "safety: a | b | c" (pipe-separated): canned answers auto-given to anyone who runs out of time, so there's no dead air and no zero (scored at half).
* "## fill" (Mad Libs): players fill blanks BLIND (they never see the sentence), then the room votes the funniest completed story. Put the sentence in "template:" with {placeholders}; blanks are taken from the {placeholders} automatically. Add "- id: hint" lines to label a blank (e.g. "- noun: an animal"). Fields: prompt, "template:", timer (default 75), maxlength, "voteprompt:", "votetimer:".
   - Add "split: true" => Would You & Split: players complete a VISIBLE dilemma, then the room votes yes/no on each; you score by splitting the room closest to 50/50.
   - Optional "safety: a | b | c": canned full-sentence answers for anyone who times out (scored at half).
* "## faker" (Hidden Faker / social deduction): everyone is shown a category and a secret WORD except one random "faker" (told the category only). Everyone gives a one-word clue, then the room accuses who the faker is. Fields: "category:" (public theme, e.g. "Animals"), "word:" (the SECRET word, never shown on the big screen or to the faker), prompt (the clue instruction), timer (default 45), "voteprompt:" (the accusation question), "votetimer:". Use a word every non-faker can hint at.

== COVER IMAGE ==
Host the image with upload_image (pass a public https URL), then put the returned Doot URL in the spec's "cover:" header or pass it as the coverImage argument to save_game/update_game/set_game_meta. Best results: a LANDSCAPE 16:9 image (e.g. 1200x675), at least ~600px wide. On game cards it is center-cropped to a wide strip (~full width x 150px) so keep the key subject centered; the detail page shows the full 16:9 image uncropped.

== VISIBILITY & REMIXABLE ==
visibility private (default, owner only) | unlisted (anyone with the link, not listed) | public (listed in discovery). remixable yes lets others copy the game into their own editor (they get a fresh private copy). Set via the spec header or the save/update/set_game_meta arguments.

== CONTENT DECKS (data-driven rounds from a spreadsheet) ==
A deck is a named-column table you DRAW rows from, so one block plays many rounds from a list of content. Define one with "## deck <id>" followed by raw CSV (or tab-separated) lines: the FIRST line is the header, each later line a row. Column keys are the lowercased headers (e.g. "Capital City" -> capital_city). Then on a round:
  - "draw: N" plays N rounds, a distinct row each (great for a big trivia/prompt set; reuses the host "how many" picker).
  - "bind: <field> = <deckId>.<column>" fills that field from a column. Bind several; fields bound to the same deck share ONE drawn row, so an image + prompt + answer stay correlated. An "image" column holds URLs and can fill an "image:" field.
Deck-backed rounds are SINGLE-block for now (guess/poll/rate/ballpark/buzzer/draw/hivemind/mostlikely), not the two-phase blocks. Answer columns (bound to a guess "correct", ballpark "answer", etc.) are withheld from non-owners just like a normal answer.

Example:
## deck capitals
country, capital, flag
France, Paris, https://img.example/fr.png
Japan, Tokyo, https://img.example/jp.png

## guess
prompt: What is the capital?
image: x
draw: 2
bind: prompt = capitals.country
bind: image = capitals.flag
- (the room picks; bind the answer too, or author fixed options)

REUSABLE DECKS (a library): instead of inlining CSV, save a deck once with save_deck and LINK it from many games. A "## deck <name>" block with a single line "link: <deckId>" references a library deck (it resolves to its current rows at play time, so editing the deck updates every game that links it). list_my_decks gives you the deckId. Example:
## deck trivia
link: lib_ab12cd34ef56
## guess
prompt: Question?
draw: 5
bind: prompt = trivia.question
bind: correct = trivia.answer

REMIX A FLAGSHIP WITH YOUR OWN CONTENT: many flagships play a built-in pool, but a creator can swap in their own deck. list_game_types marks each remixable game with a "contentDeck" kind. There are two shapes:
- PROMPT games (quip-clash, open-mic, backronym, most-likely, hivemind, sketch-spot, split-room): one text column. Use remix_game with the prompts as "csv" (one per line) and it saves a host-ready remix in one step. No markdown needed.
- TYPED games (fib-finder + ballpark + what-you-didnt-know + quiz-or-die = "quiz"; faker = "card"; mad-libs = "generic"): multiple columns (e.g. question + answer). The single-column "csv" can't carry these, so first save_deck a multi-column deck, then remix_game with its deckId. Conventional columns per game: fib-finder = question, truth; ballpark = prompt, answer (+ optional unit); what-you-didnt-know = prompt, options (a |-separated list) , correct (1-based index); quiz-or-die = question, options, correct (1-based) + an optional lurid category (the finale stays built-in); faker = category, word; mad-libs = template (with {token} blanks). Answer columns (truth, answer, correct, word) are withheld from non-owners, so KEEP A TYPED REMIX DECK PRIVATE.

== CUSTOM-FLOW GAMES (not authorable as markdown) ==
Circuit Cypher (robot rap battle), Open Mic, Truth or Share, Quiz or Die, and "What, You Didn't Know That?" have bespoke flows. Don't try to write them as markdown; tell the user to open one from the Create page and remix it, or call list_game_types.

== EXAMPLE ==
# Trivia and Vibes Night
theme: playful
description: A mixed bag of trivia, hot takes, and bad jokes.
visibility: public
remixable: yes
tags: trivia, party, mixed

## guess
prompt: What year did the first iPhone launch?
- 2007 (correct)
- 2005
- 2010

## rate
prompt: Rate tonight's playlist
categories: Energy, Variety
scale: 1-10

## quip
prompt: The worst possible name for a cruise ship
voteprompt: Which name wins?
safety: The S.S. Regret | Boaty McAwkward

## faker
category: In the kitchen
word: Toaster

Mix the round types for variety. Validate with validate_doot_game, then save_game.`

// Each tool carries `annotations` (title + readOnlyHint). Reads and writes are
// separate tools and writes are flagged not-read-only, which the Claude connector
// directory requires (see docs/connect-claude.md).
const TOOLS = [
  {
    name: 'list_game_types',
    description:
      'List the Doot game types. Some are ready-made games to remix; others are simple building blocks to fill with your own content.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'List Doot game types', readOnlyHint: true },
  },
  {
    name: 'doot_format_guide',
    description: 'Get the Doot markdown game format. Read this, then write a game and check it with validate_doot_game.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'Read the Doot game format', readOnlyHint: true },
  },
  {
    name: 'validate_doot_game',
    description:
      'Validate a Doot game written in the markdown format. Returns the parsed title, theme, rounds, and any warnings to fix. Call until clean, then save_game.',
    inputSchema: {
      type: 'object',
      properties: { markdown: { type: 'string', description: 'The game spec in Doot markdown format.' } },
      required: ['markdown'],
      additionalProperties: false,
    },
    annotations: { title: 'Validate a Doot game', readOnlyHint: true },
  },
  {
    name: 'save_game',
    description:
      "Save a Doot game (in the markdown format) to the signed-in user's account and return a link to open it. Validate it first. Game-level settings (description, visibility, remixable, coverImage, tags) can be set here OR in the spec header; an argument here overrides the header.",
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'The game spec in Doot markdown format.' },
        title: { type: 'string', description: 'Optional title override.' },
        description: { type: 'string', description: 'Optional one-line description shown on cards + the detail page (<=300 chars).' },
        visibility: {
          type: 'string',
          enum: ['private', 'unlisted', 'public'],
          description: 'private (owner only, default), unlisted (anyone with the link), or public (listed for discovery).',
        },
        remixable: { type: 'boolean', description: 'If true, others may copy this game into their own editor.' },
        coverImage: { type: 'string', description: 'A cover image URL (host it with upload_image first). Best as a 16:9 landscape; see doot_format_guide.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Up to 8 short discovery tags.' },
      },
      required: ['markdown'],
      additionalProperties: false,
    },
    annotations: { title: 'Save a Doot game to the account', readOnlyHint: false },
  },
  {
    name: 'list_my_games',
    description: "List the games in the signed-in user's account (newest first), with the gameId needed to update one.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'List the account games', readOnlyHint: true },
  },
  {
    name: 'update_game',
    description:
      "Replace the rounds (and optionally title/theme/metadata) of one of the user's existing games, by gameId, with a new markdown spec. Get the gameId from list_my_games or a prior save_game. To change ONLY metadata (description/visibility/remixable/cover/tags) without re-sending the rounds, use set_game_meta instead.",
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'string', description: 'The id of the game to update (from list_my_games or save_game).' },
        markdown: { type: 'string', description: 'The full new game spec in Doot markdown format.' },
        title: { type: 'string', description: 'Optional title override.' },
        description: { type: 'string', description: 'Optional one-line description (<=300 chars).' },
        visibility: { type: 'string', enum: ['private', 'unlisted', 'public'], description: 'private | unlisted | public.' },
        remixable: { type: 'boolean', description: 'If true, others may copy this game into their own editor.' },
        coverImage: { type: 'string', description: 'A cover image URL (host it with upload_image first).' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Up to 8 short discovery tags.' },
      },
      required: ['gameId', 'markdown'],
      additionalProperties: false,
    },
    annotations: { title: 'Update a game in the account', readOnlyHint: false },
  },
  {
    name: 'set_game_meta',
    description:
      "Change a game's settings WITHOUT touching its rounds: description, visibility (private/unlisted/public), remixable, cover image, and tags. By gameId (from list_my_games). Only the fields you pass are changed; pass an empty string/array to clear one.",
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'string', description: 'The id of the game to update (from list_my_games).' },
        description: { type: 'string', description: 'One-line description (<=300 chars); empty string clears it.' },
        visibility: {
          type: 'string',
          enum: ['private', 'unlisted', 'public'],
          description: 'private (owner only), unlisted (anyone with the link), or public (listed for discovery).',
        },
        remixable: { type: 'boolean', description: 'If true, others may copy this game into their own editor.' },
        coverImage: { type: 'string', description: 'A cover image URL (host it with upload_image first); empty string clears it.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Up to 8 short discovery tags; empty array clears them.' },
        theme: { type: 'string', enum: ['doot', 'cutesie', 'cyber', 'professional', 'playful'], description: 'Optional theme change.' },
      },
      required: ['gameId'],
      additionalProperties: false,
    },
    annotations: { title: "Set a game's settings", readOnlyHint: false },
  },
  {
    name: 'list_my_decks',
    description:
      "List the reusable content decks in the user's library (newest first), with each deckId. A deck is a table of rows (questions, prompts, images) a game can pull from. Use a deckId to update a deck, or to reference it from a game spec's `## deck <id>` block as `link: <deckId>`.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'List the account decks', readOnlyHint: true },
  },
  {
    name: 'save_deck',
    description:
      "Save a reusable content deck to the user's library from CSV/TSV (first row = headers), and return its deckId. A deck is a named-column table of rows: e.g. a Quiz deck (question, answer, image columns), a Prompt deck (a column of prompts/dares), or anything (Generic). Games reference it by deckId (a `## deck <id>` block with `link: <deckId>`) and bind round fields to its columns. Image columns should hold image URLs (host them with upload_image first).",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The deck name (shown in the library).' },
        csv: { type: 'string', description: 'The rows as CSV or TSV; the first row is the column headers.' },
        kind: { type: 'string', enum: ['generic', 'quiz', 'prompt', 'card'], description: 'A descriptor hint (default generic): quiz = question/answer columns; prompt = a column of prompts; card = freeform; generic = anything.' },
        description: { type: 'string', description: 'Optional one-line description (<=300 chars).' },
        visibility: { type: 'string', enum: ['private', 'unlisted', 'public'], description: 'private (default), unlisted, or public (listed in the library).' },
        remixable: { type: 'boolean', description: 'If true, others may copy this deck into their own library.' },
      },
      required: ['name', 'csv'],
      additionalProperties: false,
    },
    annotations: { title: 'Save a content deck', readOnlyHint: false },
  },
  {
    name: 'update_deck',
    description: "Replace a deck's rows (and optionally its name/kind/visibility/remixable) by deckId, with new CSV/TSV. Get the deckId from list_my_decks. A game that links this deck picks up the change automatically.",
    inputSchema: {
      type: 'object',
      properties: {
        deckId: { type: 'string', description: 'The id of the deck to update (from list_my_decks or save_deck).' },
        name: { type: 'string', description: 'Optional new name.' },
        csv: { type: 'string', description: 'The full new rows as CSV or TSV; the first row is the column headers.' },
        kind: { type: 'string', enum: ['generic', 'quiz', 'prompt', 'card'], description: 'Optional descriptor hint.' },
        description: { type: 'string', description: 'Optional one-line description.' },
        visibility: { type: 'string', enum: ['private', 'unlisted', 'public'], description: 'private | unlisted | public.' },
        remixable: { type: 'boolean', description: 'If true, others may copy this deck.' },
      },
      required: ['deckId', 'csv'],
      additionalProperties: false,
    },
    annotations: { title: 'Update a content deck', readOnlyHint: false },
  },
  {
    name: 'remix_game',
    description:
      "Remix a pool-driven Doot flagship to play YOUR content. Attach a content deck to a game and it plays your content instead of the built-in pool (the host still shuffles + picks how many each play). PROMPT games (quip-clash, open-mic, backronym, most-likely, hivemind, sketch-spot, split-room) take a single text column: give it as 'csv' (one prompt per line). TYPED games (fib-finder, ballpark, what-you-didnt-know, faker, mad-libs) need multiple columns, so save_deck first and pass its 'deckId'. See list_game_types for which games are remixable and their deck kind. Returns a link to host the remix.",
    inputSchema: {
      type: 'object',
      properties: {
        game: { type: 'string', description: 'A deck-feedable flagship id. See list_game_types for the remixable games + their contentDeck kind.' },
        name: { type: 'string', description: 'A name for this remix (and the new deck if csv is given), e.g. "Office Edition".' },
        csv: { type: 'string', description: 'For a PROMPT game: your prompts, one per line. A typed (quiz/card/generic) game ignores csv; use deckId instead.' },
        deckId: { type: 'string', description: 'An existing deck id (from save_deck / list_my_decks) to attach. Required for typed (multi-column) games.' },
      },
      required: ['game', 'name'],
      additionalProperties: false,
    },
    annotations: { title: 'Remix a flagship with your content', readOnlyHint: false },
  },
  {
    name: 'upload_image',
    description:
      'Fetch an image from a public https URL and host it on Doot, returning a Doot URL. Use it for a round "image:" field OR as a game "coverImage" (then pass that URL to save_game/update_game/set_game_meta). PNG, JPEG, GIF, or WebP, up to 5MB. For a cover, prefer a LANDSCAPE 16:9 image (e.g. 1200x675); cards center-crop it to a wide strip, the detail page shows it full.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'A public https URL of a PNG, JPEG, GIF, or WebP image.' } },
      required: ['url'],
      additionalProperties: false,
    },
    annotations: { title: 'Upload an image to Doot', readOnlyHint: false },
  },
]

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], isError })

type Visibility = 'private' | 'unlisted' | 'public'
function normVisibility(v: unknown): Visibility | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().toLowerCase()
  if (s === 'public' || s === 'published' || s === 'listed') return 'public'
  if (s === 'unlisted') return 'unlisted'
  if (s === 'private' || s === 'hidden') return 'private'
  return undefined
}
function normTags(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 8)
}
/** Merge game-level metadata from the parsed spec header with explicit tool args
 *  (the args win). Each field is undefined when neither set it. */
function resolveMeta(parsed: ReturnType<typeof parseMarkdownGame>, args: Record<string, unknown>) {
  return {
    visibility: normVisibility(args.visibility) ?? parsed.visibility,
    description: typeof args.description === 'string' ? args.description.trim().slice(0, 300) : parsed.description,
    forkable: typeof args.remixable === 'boolean' ? args.remixable : parsed.forkable,
    coverImage: typeof args.coverImage === 'string' ? args.coverImage.trim() : parsed.coverImage,
    tags: normTags(args.tags) ?? parsed.tags,
  }
}

async function callTool(name: string, args: Record<string, unknown>, userId: string): Promise<ToolResult> {
  if (name === 'list_game_types') {
    const types = gameCatalog.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      kind: g.flagship ? 'ready-made game (remixable)' : 'building block',
      // Deck-feedable: remix_game can attach a deck of this kind to play custom content.
      ...(g.pool ? { contentDeck: g.pool.deckKind } : {}),
    }))
    return text(JSON.stringify(types, null, 2))
  }
  if (name === 'doot_format_guide') return text(FORMAT_GUIDE)
  if (name === 'validate_doot_game' || name === 'save_game') {
    const md = typeof args.markdown === 'string' ? args.markdown : ''
    if (!md.trim()) return text('Provide the game as markdown in the "markdown" argument.', true)
    if (md.length > 50_000) return text('Spec too long (50000 character limit).', true)
    const parsed = parseMarkdownGame(md)
    if (name === 'validate_doot_game') {
      const rounds = parsed.rounds.map((r, i) => {
        const c = r.content as Record<string, unknown>
        return { n: i + 1, block: r.block, prompt: typeof c.prompt === 'string' ? c.prompt : '' }
      })
      const ok = parsed.warnings.length === 0
      return text(
        JSON.stringify(
          {
            ok,
            title: parsed.title,
            theme: parsed.themeId ?? null,
            roundCount: parsed.rounds.length,
            rounds,
            warnings: parsed.warnings,
            next: ok ? 'Valid. Call save_game to add it to the account.' : 'Fix the warnings, then validate again.',
          },
          null,
          2,
        ),
      )
    }
    // save_game
    if (!writeAllowed(userId)) return text('Too many saves in a short time. Wait a minute and try again.', true)
    if (!parsed.rounds.length) {
      return text(`No valid rounds were parsed. ${parsed.warnings.join(' ')}`, true)
    }
    const rawTitle = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : parsed.title
    const allRounds = parsed.rounds.map((r) => ({ block: r.block, content: r.content as Record<string, unknown> }))
    const rounds = allRounds.slice(0, 50)
    const themeId = parsed.themeId && KNOWN_THEMES.has(parsed.themeId) ? parsed.themeId : undefined
    const meta = resolveMeta(parsed, args)
    const visibility = meta.visibility ?? 'private' // privacy-safe default
    // Validate through the same schema the web route uses (title<=120, rounds<=50,
    // etc.) so the MCP path can't store an oversized or malformed game.
    const input = gameInputSchema.safeParse({
      pluginId: 'custom',
      themeId,
      visibility,
      ...(meta.description !== undefined ? { description: meta.description } : {}),
      ...(meta.forkable !== undefined ? { forkable: meta.forkable } : {}),
      ...(meta.coverImage ? { coverImage: meta.coverImage } : {}),
      ...(meta.tags ? { tags: meta.tags } : {}),
      config: { title: rawTitle.slice(0, 120), rounds, ...(parsed.decks ? { decks: parsed.decks } : {}) },
    })
    if (!input.success) {
      return text(`Could not save: ${input.error.issues.map((i) => i.message).join('; ')}`, true)
    }
    const { id } = await createGame(input.data, userId)
    return text(
      JSON.stringify(
        {
          saved: true,
          gameId: id,
          openUrl: `${BASE}/editor/g/${id}`,
          gameUrl: `${BASE}/g/${id}`,
          theme: themeId ?? 'doot',
          visibility,
          remixable: meta.forkable ?? false,
          hasCover: !!meta.coverImage,
          roundsSaved: rounds.length,
          droppedRounds: allRounds.length - rounds.length,
          warnings: parsed.warnings,
          message: `Saved to the account (${visibility}). Open the link to review, theme, and host it.${
            meta.coverImage ? '' : ' Tip: add a cover image with upload_image + set_game_meta.'
          }`,
        },
        null,
        2,
      ),
    )
  }
  if (name === 'list_my_games') {
    const games = await listMyGames(userId)
    return text(
      JSON.stringify(
        games.map((g) => ({
          gameId: g.id,
          title: g.title,
          type: g.pluginId,
          visibility: g.visibility,
          remixable: g.forkable,
          description: g.description ?? null,
          tags: g.tags,
          hasCover: !!g.coverImage,
          openUrl: `${BASE}/editor/g/${g.id}`,
          gameUrl: `${BASE}/g/${g.id}`,
        })),
        null,
        2,
      ),
    )
  }
  if (name === 'update_game') {
    if (!writeAllowed(userId)) return text('Too many updates in a short time. Wait a minute and try again.', true)
    const gameId = typeof args.gameId === 'string' ? args.gameId.trim() : ''
    const md = typeof args.markdown === 'string' ? args.markdown : ''
    if (!gameId) return text('Provide the gameId of the game to update (from list_my_games).', true)
    if (!md.trim()) return text('Provide the new game as markdown in the "markdown" argument.', true)
    if (md.length > 50_000) return text('Spec too long (50000 character limit).', true)
    const parsed = parseMarkdownGame(md)
    if (!parsed.rounds.length) return text(`No valid rounds were parsed. ${parsed.warnings.join(' ')}`, true)
    const rawTitle = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : parsed.title
    const allRounds = parsed.rounds.map((r) => ({ block: r.block, content: r.content as Record<string, unknown> }))
    const rounds = allRounds.slice(0, 50)
    const themeId = parsed.themeId && KNOWN_THEMES.has(parsed.themeId) ? parsed.themeId : undefined
    const meta = resolveMeta(parsed, args)
    // Only metadata that was actually supplied (spec header or arg) is sent, so a
    // rounds-only update leaves visibility/description/etc. as-is (updateGame keeps
    // omitted fields). An explicit empty value clears the field.
    const input = gameInputSchema.safeParse({
      pluginId: 'custom',
      themeId,
      ...(meta.visibility ? { visibility: meta.visibility } : {}),
      ...(meta.description !== undefined ? { description: meta.description } : {}),
      ...(meta.forkable !== undefined ? { forkable: meta.forkable } : {}),
      ...(meta.coverImage !== undefined ? { coverImage: meta.coverImage } : {}),
      ...(meta.tags !== undefined ? { tags: meta.tags } : {}),
      config: { title: rawTitle.slice(0, 120), rounds, ...(parsed.decks ? { decks: parsed.decks } : {}) },
    })
    if (!input.success) {
      return text(`Could not update: ${input.error.issues.map((i) => i.message).join('; ')}`, true)
    }
    const ok = await updateGame(gameId, userId, input.data)
    if (!ok) return text('No game with that id is owned by this account, so nothing was updated.', true)
    return text(
      JSON.stringify(
        {
          updated: true,
          gameId,
          openUrl: `${BASE}/editor/g/${gameId}`,
          gameUrl: `${BASE}/g/${gameId}`,
          roundsSaved: rounds.length,
          droppedRounds: allRounds.length - rounds.length,
          message: 'Updated. Open the link to review and host it.',
        },
        null,
        2,
      ),
    )
  }
  if (name === 'set_game_meta') {
    if (!writeAllowed(userId)) return text('Too many updates in a short time. Wait a minute and try again.', true)
    const gameId = typeof args.gameId === 'string' ? args.gameId.trim() : ''
    if (!gameId) return text('Provide the gameId of the game to change (from list_my_games).', true)
    const fields: { visibility?: Visibility; forkable?: boolean; description?: string; coverImage?: string; tags?: string[]; themeId?: string } = {}
    const vis = normVisibility(args.visibility)
    if (vis) fields.visibility = vis
    if (typeof args.remixable === 'boolean') fields.forkable = args.remixable
    if (typeof args.description === 'string') fields.description = args.description.trim().slice(0, 300)
    if (typeof args.coverImage === 'string') fields.coverImage = args.coverImage.trim()
    const tags = normTags(args.tags)
    if (tags !== undefined) fields.tags = tags
    if (typeof args.theme === 'string' && KNOWN_THEMES.has(args.theme.trim().toLowerCase())) fields.themeId = args.theme.trim().toLowerCase()
    if (Object.keys(fields).length === 0) {
      return text('Nothing to change. Pass at least one of: description, visibility, remixable, coverImage, tags, theme.', true)
    }
    const ok = await patchGameMeta(gameId, userId, fields)
    if (!ok) return text('No game with that id is owned by this account, so nothing was changed.', true)
    return text(
      JSON.stringify(
        { updated: true, gameId, changed: Object.keys(fields), openUrl: `${BASE}/editor/g/${gameId}`, gameUrl: `${BASE}/g/${gameId}` },
        null,
        2,
      ),
    )
  }
  if (name === 'list_my_decks') {
    const decks = await listMyDecks(userId)
    return text(
      JSON.stringify(
        decks.map((d) => ({
          deckId: d.id,
          name: d.name,
          kind: d.kind,
          visibility: d.visibility,
          remixable: d.remixable,
          rows: d.rowCount,
          columns: d.columnCount,
          description: d.description ?? null,
          deckUrl: `${BASE}/decks/${d.id}/edit`,
        })),
        null,
        2,
      ),
    )
  }
  if (name === 'save_deck' || name === 'update_deck') {
    if (!writeAllowed(userId)) return text('Too many deck saves in a short time. Wait a minute and try again.', true)
    const csv = typeof args.csv === 'string' ? args.csv : ''
    if (!csv.trim()) return text('Provide the deck rows as CSV/TSV in the "csv" argument (first row = headers).', true)
    if (csv.length > 1_000_000) return text('Deck CSV too large (1,000,000 character limit).', true)
    const sheet = parseSheet(csv)
    if (!sheet.columns.length || !sheet.rows.length) {
      return text(`Could not parse a header + rows from the CSV. ${sheet.errors.slice(0, 3).join(' ')}`, true)
    }
    const vis = normVisibility(args.visibility)
    const deckInput = deckInputSchema.safeParse({
      name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'Untitled deck',
      ...(typeof args.description === 'string' ? { description: args.description } : {}),
      ...(typeof args.kind === 'string' ? { kind: args.kind } : {}),
      ...(vis ? { visibility: vis } : {}),
      ...(typeof args.remixable === 'boolean' ? { remixable: args.remixable } : {}),
      columns: sheet.columns,
      rows: sheet.rows,
    })
    if (!deckInput.success) {
      return text(`Could not save the deck: ${deckInput.error.issues.map((i) => i.message).join('; ')}`, true)
    }
    if (name === 'save_deck') {
      const { id } = await createDeck(deckInput.data, userId)
      return text(
        JSON.stringify(
          {
            saved: true,
            deckId: id,
            rows: sheet.rows.length,
            columns: sheet.columns.map((c) => c.key),
            deckUrl: `${BASE}/decks/${id}/edit`,
            message: `Saved a ${sheet.rows.length}-row deck. To use it in a game spec, add a block "## deck <name>" with a single line "link: ${id}", then bind a round's fields with "bind: field = <name>.column".`,
          },
          null,
          2,
        ),
      )
    }
    const deckId = typeof args.deckId === 'string' ? args.deckId.trim() : ''
    if (!deckId) return text('Provide the deckId to update (from list_my_decks).', true)
    const ok = await updateDeck(deckId, userId, deckInput.data)
    if (!ok) return text('No deck with that id is owned by this account, so nothing was updated.', true)
    return text(JSON.stringify({ updated: true, deckId, rows: sheet.rows.length, deckUrl: `${BASE}/decks/${deckId}/edit` }, null, 2))
  }
  if (name === 'remix_game') {
    if (!writeAllowed(userId)) return text('Too many saves in a short time. Wait a minute and try again.', true)
    const gameId = typeof args.game === 'string' ? args.game.trim() : ''
    const entry = gameCatalog.find((g) => g.id === gameId)
    if (!entry?.pool) {
      const feedable = gameCatalog.filter((g) => g.pool).map((g) => g.id).join(', ')
      return text(`"${gameId}" is not a deck-feedable game. Remixable games: ${feedable}.`, true)
    }
    const title = typeof args.name === 'string' && args.name.trim() ? args.name.trim().slice(0, 120) : `${entry.name} remix`
    let deckId = typeof args.deckId === 'string' ? args.deckId.trim() : ''
    if (!deckId) {
      // The single-column csv path only fits a one-text-column (prompt) deck. A typed
      // game (quiz/card/generic) needs multiple correlated columns, so it must come via
      // save_deck + deckId — a bare prompt list would lose its answers/options.
      if (entry.pool.deckKind !== 'prompt') {
        return text(
          `"${gameId}" is a ${entry.pool.deckKind} game (multi-column). Build the deck with save_deck (conventional columns: ${POOL_COLUMNS[gameId] ?? 'see doot_format_guide'}), then call remix_game with its deckId.`,
          true,
        )
      }
      const csv = typeof args.csv === 'string' ? args.csv : ''
      if (!csv.trim()) return text('Provide your prompts in "csv" (one per line) or an existing "deckId".', true)
      if (csv.length > 1_000_000) return text('Too much content (1,000,000 character limit).', true)
      // A remix deck is a single prompt column, so take ONE PROMPT PER LINE (commas
      // inside a prompt are preserved, unlike a CSV parse). Drop blanks + an optional
      // "prompt" header line. For multi-column decks, use save_deck then pass deckId.
      const lines = csv
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && l.toLowerCase() !== 'prompt')
      if (!lines.length) return text('No prompts found in "csv" (put one prompt per line).', true)
      const deckInput = deckInputSchema.safeParse({
        name: title,
        kind: entry.pool.deckKind,
        columns: [{ key: 'prompt', label: 'Prompt', type: 'text' }],
        rows: lines.slice(0, 1000).map((prompt) => ({ prompt })),
      })
      if (!deckInput.success) return text(`Could not save the deck: ${deckInput.error.issues.map((i) => i.message).join('; ')}`, true)
      deckId = (await createDeck(deckInput.data, userId)).id
    }
    const input = gameInputSchema.safeParse({
      pluginId: gameId,
      config: { title, rounds: [{ block: entry.pool.placeholderBlock, content: {} }], decks: { pool: { ref: deckId } } },
    })
    if (!input.success) return text(`Could not save the remix: ${input.error.issues.map((i) => i.message).join('; ')}`, true)
    const { id } = await createGame(input.data, userId)
    return text(
      JSON.stringify(
        {
          remixed: true,
          gameId: id,
          deckId,
          game: gameId,
          gameUrl: `${BASE}/g/${id}`,
          hostUrl: `${BASE}/host/g/${id}`,
          message: `Saved "${title}". Open the link to host ${entry.name} with your own content (the host shuffles your deck + picks how many each play).`,
        },
        null,
        2,
      ),
    )
  }
  if (name === 'upload_image') {
    if (!writeAllowed(userId)) return text('Too many uploads in a short time. Wait a minute and try again.', true)
    if (!isStorageConfigured()) return text('Image upload is not set up on this Doot instance.', true)
    const src = typeof args.url === 'string' ? args.url.trim() : ''
    if (!src) return text('Provide an image URL in the "url" argument.', true)
    let img: { contentType: string; bytes: Uint8Array }
    try {
      img = await fetchImage(src)
    } catch (e) {
      return text(e instanceof Error ? e.message : 'Could not fetch the image.', true)
    }
    const ext = extensionFor(img.contentType)
    if (!ext) return text('Unsupported image type.', true)
    const key = `uploads/${userId}/${crypto.randomUUID()}.${ext}`
    const imageUrl = await uploadObject(key, img.contentType, img.bytes)
    return text(
      JSON.stringify({ uploaded: true, imageUrl, message: 'Use this URL as the "image:" field on a round.' }, null, 2),
    )
  }
  return text(`Unknown tool: ${name}`, true)
}

type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

async function handleRpc(msg: RpcMessage, userId: string): Promise<object | null> {
  if (!msg || typeof msg !== 'object') {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
  }
  const { id, method, params } = msg
  const isNotification = id === undefined || id === null
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: (params?.protocolVersion as string) || DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Build a Doot party game: call doot_format_guide first (it covers every block, the two-phase make/judge rounds, Mad Libs, the hidden Faker, plus game settings - description, visibility public/unlisted/private, remixable, cover image, tags). Write a markdown spec, validate_doot_game, then save_game. Host a cover image with upload_image and set it (and any settings) via save_game/update_game/set_game_meta.',
      })
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: TOOLS })
    case 'tools/call': {
      const name = params?.name
      const args = (params?.arguments ?? {}) as Record<string, unknown>
      if (typeof name !== 'string') return fail(-32602, 'Invalid params: missing tool name')
      try {
        return ok(await callTool(name, args, userId))
      } catch (e) {
        return ok(text(`Tool error: ${e instanceof Error ? e.message : String(e)}`, true))
      }
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${method}`)
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

// withMcpAuth validates the OAuth bearer token; an unauthenticated request gets a
// 401 + WWW-Authenticate pointing Claude at the protected-resource metadata.
const mcpHandler = withMcpAuth(useAuth(), async (req, session) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }
  const userId = session.userId
  const messages = Array.isArray(body) ? (body as RpcMessage[]) : [body as RpcMessage]
  const settled = await Promise.all(messages.map((m) => handleRpc(m, userId)))
  const responses = settled.filter((r): r is object => r !== null)
  if (responses.length === 0) return new Response(null, { status: 202 })
  return json(Array.isArray(body) ? responses : responses[0])
})

export default defineEventHandler((event) => {
  if (event.method !== 'POST') {
    setResponseStatus(event, 405)
    setResponseHeader(event, 'Allow', 'POST')
    return ''
  }
  return mcpHandler(toWebRequest(event))
})
