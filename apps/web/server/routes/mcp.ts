/**
 * "Connect with Claude": a Model Context Protocol (MCP) server at /mcp.
 *
 * A user connects their own Claude (Claude Code or the desktop app) to this
 * endpoint and Claude builds a Doot game for them. Doot runs NO inference and
 * stores no API keys; it only exposes deterministic, read-only tools over the
 * server-safe markdown format. The user's Claude writes a spec, validates it
 * here, and the user pastes it into the editor's Import box.
 *
 * Transport: stateless Streamable HTTP (JSON-RPC 2.0 over POST, one JSON
 * response per request). No sessions, no server-initiated SSE, no auth in v1.
 * An OAuth-protected `save_game` tool can come later (see
 * docs/plugin-authoring-roadmap.md), which is the only part that needs auth.
 */
import { gameCatalog } from '@doot-games/games/catalog'
import { parseMarkdownGame } from '@doot-games/games/markdown'

const SERVER_INFO = { name: 'doot', title: 'Doot', version: '0.1.0' }
const DEFAULT_PROTOCOL = '2025-06-18'

const FORMAT_GUIDE = `Write a Doot party game as a Markdown spec. The user pastes it into Doot's editor: open Create, pick the Custom game type, click "Import from Markdown", paste, Import. Output ONLY the spec, no commentary, no code fences.

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

## poll
prompt: Where to next?
- The bar down the street
- Stay here
- Call it a night

Mix the round types for variety. After writing a spec, call validate_doot_game to check it, then give the user the final spec to paste into Doot.`

const TOOLS = [
  {
    name: 'list_game_types',
    description:
      'List the Doot game types. Some are ready-made games the user can remix; others are simple building blocks to fill with your own content.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'doot_format_guide',
    description:
      'Get the Doot markdown game format. Read this, then write a game as markdown and check it with validate_doot_game.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'validate_doot_game',
    description:
      'Validate a Doot game written in the markdown format. Returns the parsed title, theme, rounds, and any warnings to fix. Call this until there are no warnings, then give the user the spec to paste into Doot.',
    inputSchema: {
      type: 'object',
      properties: { markdown: { type: 'string', description: 'The game spec in Doot markdown format.' } },
      required: ['markdown'],
      additionalProperties: false,
    },
  },
]

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], isError })

function callTool(name: string, args: Record<string, unknown>): ToolResult {
  if (name === 'list_game_types') {
    const types = gameCatalog.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      kind: g.flagship ? 'ready-made game (remixable)' : 'building block',
    }))
    return text(JSON.stringify(types, null, 2))
  }
  if (name === 'doot_format_guide') {
    return text(FORMAT_GUIDE)
  }
  if (name === 'validate_doot_game') {
    const md = typeof args.markdown === 'string' ? args.markdown : ''
    if (!md.trim()) return text('Provide the game as markdown in the "markdown" argument.', true)
    if (md.length > 50_000) return text('Spec too long (50000 character limit).', true)
    const parsed = parseMarkdownGame(md)
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
          next: ok
            ? 'Valid. Give the user this exact markdown to paste into Doot (Create, Custom game type, Import from Markdown).'
            : 'Fix the warnings, then call validate_doot_game again.',
        },
        null,
        2,
      ),
    )
  }
  return text(`Unknown tool: ${name}`, true)
}

type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

function handleRpc(msg: RpcMessage): object | null {
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
          'Build a Doot party game: call doot_format_guide, write a markdown spec, check it with validate_doot_game, then give the user the spec to paste into Doot.',
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
        return ok(callTool(name, args))
      } catch (e) {
        return ok(text(`Tool error: ${e instanceof Error ? e.message : String(e)}`, true))
      }
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${method}`)
  }
}

export default defineEventHandler(async (event) => {
  if (event.method === 'GET' || event.method === 'DELETE') {
    // Stateless tools server: no server-initiated SSE stream, no sessions.
    setResponseStatus(event, 405)
    setResponseHeader(event, 'Allow', 'POST')
    return { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'POST-only MCP endpoint (stateless).' } }
  }
  if (event.method !== 'POST') {
    setResponseStatus(event, 405)
    return ''
  }

  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }
  }

  const messages = Array.isArray(body) ? (body as RpcMessage[]) : [body as RpcMessage]
  const responses = messages.map(handleRpc).filter((r): r is object => r !== null)

  if (responses.length === 0) {
    // The batch was only notifications/responses: acknowledge with no body.
    setResponseStatus(event, 202)
    return ''
  }
  setResponseHeader(event, 'Content-Type', 'application/json')
  return Array.isArray(body) ? responses : responses[0]
})
