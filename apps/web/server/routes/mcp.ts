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
* "## draw": players sketch the prompt. Fields: prompt, image, timer (default 60).

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

Mix the round types for variety. Validate with validate_doot_game, then save_game.`

const TOOLS = [
  {
    name: 'list_game_types',
    description:
      'List the Doot game types. Some are ready-made games to remix; others are simple building blocks to fill with your own content.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'doot_format_guide',
    description: 'Get the Doot markdown game format. Read this, then write a game and check it with validate_doot_game.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
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
    if (!parsed.rounds.length) {
      return text(`No valid rounds were parsed. ${parsed.warnings.join(' ')}`, true)
    }
    const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : parsed.title
    const rounds = parsed.rounds.map((r) => ({ block: r.block, content: r.content as Record<string, unknown> }))
    const { id } = await createGame({ pluginId: 'custom', visibility: 'private', config: { title, rounds } }, userId)
    return text(
      JSON.stringify(
        {
          saved: true,
          gameId: id,
          openUrl: `${BASE}/editor/g/${id}`,
          warnings: parsed.warnings,
          message: 'Saved to the account (private). Open the link to review, theme, and host it.',
        },
        null,
        2,
      ),
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
