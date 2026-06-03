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

const FORMAT_GUIDE = `Write a Doot party game as a Markdown spec, then call save_game to add it to the user's Doot account. Output ONLY the spec when you show it, no code fences.

# Game Title
theme: doot            (optional, before the first round; one of: doot, cutesie, cyber, professional, playful)

Then one or more rounds. Each round starts with a "## <block>" heading, then "key: value" lines and "- item" lines.
"timer:" is seconds, or "none". "image:" is an optional image URL shown with the prompt.

Block kinds:
* "## guess": multiple choice with ONE right answer. Fields: subject (optional), prompt, image, timer (default 20). List 2 or more "- choice"; mark the correct one with "(correct)".
* "## poll": opinion, no right answer. Fields: prompt, image, timer (default none). List 2 or more "- choice".
* "## rank": players put items in order. Fields: prompt, image, timer (default none). List 2 or more "- item".
* "## rate": score subjects on a scale. Fields: subject, prompt, image, timer, "categories: A, B, C", and "scale:" (a numeric range like "1-10", or comma-separated labels like "F, D, C, B, A").
* "## draw": players sketch the prompt. Fields: prompt, image, timer (default 60). Add "vote: true" to make it draw-then-vote: everyone draws, then the room votes on the anonymized gallery and the best drawing wins points and tops the results. Optional with vote: "voteprompt:" (the vote question) and "votetimer:" (seconds to vote, default 30).
* "## hivemind": everyone answers a prompt in free text and scores by MATCHING the crowd (the "read the room" game). Fields: prompt, timer (default 30). Pick prompts with an obvious popular answer ("Name a color of the rainbow"). No "- " items.
* "## mostlikely": the room votes a PLAYER from the lobby for a "most likely to..." prompt. Fields: prompt, timer (default 20). The options are the players, so no "- " items. Keep prompts party-safe.
* "## ballpark": numeric trivia, closest guess wins. Fields: subject (optional), prompt, image, "answer:" (the true NUMBER, hidden from players until reveal), "unit:" (optional, e.g. km, %, years), timer (default 30). No "- " items. Use facts nobody knows exactly.
* "## buzzer": first-correct trivia, the fastest right answer scores the most. Fields: subject (optional), prompt, image, timer (default 20), "points:" (what the question is worth, default 100; raise it each round to escalate). List 2 or more "- choice"; mark the right one with "(correct)".

Two-phase rounds (a writing round, then a vote on the anonymized answers - one heading expands to both):
* "## quip": everyone writes an answer, then the room votes for the best (Write & Vote / Quiplash). Fields: prompt, timer (default 60), maxlength, "voteprompt:" and "votetimer:" (default 30). Add "truth: <the real answer>" to make it Lie Detector instead: players write a believable LIE to your trivia question (the prompt) and then must spot the one true answer. Optional "safety: a | b | c" (pipe-separated): canned answers given to anyone who runs out of time so there is no dead air (scored at half).
* "## fill": fill-in-the-blanks, then vote on the funniest result (Mad Libs). Write the sentence in "template:" with {placeholders}; the blanks are taken from the {placeholders} automatically (add "- id: hint" lines to label them, e.g. "- noun: an animal"). Fields: prompt, "template:", timer (default 75), maxlength, "voteprompt:"/"votetimer:". Add "split: true" to make it Would You & Split instead: players complete a visible dilemma, then the room votes yes/no on each. Optional "safety: a | b | c" (pipe-separated): canned full-sentence answers for anyone who runs out of time (scored at half).

Other games (Faker, Truth or Share, Circuit Cypher, Open Mic) have custom flows that markdown does not author; suggest the user open one from the Create page and remix it, or call list_game_types to see all ready-made games.

Example:
# Trivia and Vibes Night
theme: playful

## guess
prompt: What year did the first iPhone launch?
- 2007 (correct)
- 2005
- 2010

## rate
prompt: Rate tonight's playlist
categories: Energy, Variety
scale: 1-10

## draw
prompt: Draw your spirit animal
vote: true
votetimer: 30

## quip
prompt: The worst possible name for a cruise ship
voteprompt: Which name wins?

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
      "Save a Doot game (in the markdown format) to the signed-in user's account and return a link to open it. Validate it first.",
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'The game spec in Doot markdown format.' },
        title: { type: 'string', description: 'Optional title override.' },
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
      "Replace the rounds (and optionally title/theme) of one of the user's existing games, by gameId, with a new markdown spec. Get the gameId from list_my_games or a prior save_game.",
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'string', description: 'The id of the game to update (from list_my_games or save_game).' },
        markdown: { type: 'string', description: 'The full new game spec in Doot markdown format.' },
        title: { type: 'string', description: 'Optional title override.' },
      },
      required: ['gameId', 'markdown'],
      additionalProperties: false,
    },
    annotations: { title: 'Update a game in the account', readOnlyHint: false },
  },
  {
    name: 'upload_image',
    description:
      'Fetch an image from a public https URL and host it on Doot, returning a Doot image URL to use as the "image:" field on a round (guess, poll, rate, or draw). PNG, JPEG, GIF, or WebP, up to 5MB.',
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
    // Validate through the same schema the web route uses (title<=120, rounds<=50,
    // etc.) so the MCP path can't store an oversized or malformed game.
    const input = gameInputSchema.safeParse({
      pluginId: 'custom',
      visibility: 'private',
      themeId,
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
          theme: themeId ?? 'doot',
          roundsSaved: rounds.length,
          droppedRounds: allRounds.length - rounds.length,
          warnings: parsed.warnings,
          message: 'Saved to the account (private). Open the link to review, theme, and host it.',
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
          openUrl: `${BASE}/editor/g/${g.id}`,
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
    const input = gameInputSchema.safeParse({
      pluginId: 'custom',
      themeId,
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
          roundsSaved: rounds.length,
          droppedRounds: allRounds.length - rounds.length,
          message: 'Updated. Open the link to review and host it.',
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
          'Build a Doot party game: call doot_format_guide, write a markdown spec, validate it, then save_game to add it to the account.',
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
