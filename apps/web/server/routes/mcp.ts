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
import { parseMarkdownGame } from '@doot-games/games/markdown'
import { withMcpAuth } from 'better-auth/plugins'

const SERVER_INFO = { name: 'doot', title: 'Doot', version: '0.1.0' }
const DEFAULT_PROTOCOL = '2025-06-18'
const BASE = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
const KNOWN_THEMES = new Set(['doot', 'cutesie', 'cyber', 'professional', 'playful'])

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
* "## guess": multiple choice, ONE right answer (scored: faster correct = more). Fields: subject (optional), prompt, image, timer (default 20). List 2+ "- choice"; mark the right one "(correct)".
* "## buzzer": first-correct trivia, fastest right answer scores most. Fields: subject, prompt, image, timer (default 20), "points:" (worth, default 100; raise each round to escalate). 2+ "- choice"; "(correct)" marks the answer.
* "## poll": opinion, no right answer. Fields: prompt, image, timer (default none). 2+ "- choice".
* "## rank": players drag items into order; a consensus ranking is shown. Fields: prompt, image, timer (default none). 2+ "- item".
* "## rate": score subjects on a scale. Fields: subject, prompt, image, timer, "categories: A, B, C", "scale:" (a range like "1-10", or labels like "F, D, C, B, A").
* "## draw": players sketch the prompt. Fields: prompt, image, timer (default 60). Add "vote: true" for draw-then-vote (the room votes the best drawing). With vote: "voteprompt:", "votetimer:" (default 30).
* "## hivemind": free-text answer, score by MATCHING the crowd ("read the room"). Fields: prompt, timer (default 30). Use prompts with an obvious popular answer ("Name a color of the rainbow"). No "- " items.
* "## mostlikely": the room votes a PLAYER from the lobby ("most likely to..."). Fields: prompt, timer (default 20). Options ARE the players, so no "- " items. Keep it party-safe.
* "## ballpark": numeric trivia, closest guess wins. Fields: subject, prompt, image, "answer:" (the true NUMBER, hidden until reveal), "unit:" (optional: km, %, years), timer (default 30). No "- " items. Use facts nobody knows exactly.

== TWO-PHASE BLOCKS (one heading expands to TWO rounds: a "make" round, then a "judge" round) ==
How they work: the make round collects everyone's PRIVATE submission; the judge round is built AT RUNTIME from those submissions, anonymized and shuffled, for the room to vote on. You never write the judge options yourself - they ARE the players' answers. A player can't vote for their own.
* "## quip": everyone writes an answer, then the room votes the best (Write & Vote / Quiplash). Fields: prompt, timer (default 60), maxlength, "voteprompt:", "votetimer:" (default 30).
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
      config: { title: rawTitle.slice(0, 120), rounds },
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
      config: { title: rawTitle.slice(0, 120), rounds },
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
