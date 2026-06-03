# Connect with Claude (the Doot MCP server)

How a user links their Doot account inside Claude and has Claude build games for
them, with no inference cost to Doot. This is the only AI path on the site (owner
decision: no Doot-paid AI, no heavy "AI" copy, brand it "Connect with Claude").

## What it is

Doot runs a Model Context Protocol (MCP) server at `https://doot.games/mcp`. A user
adds it as a connector in claude.ai (or with `claude mcp add` in Claude Code), links
their Doot account through OAuth, and Claude builds a game and saves it straight to
the account. Doot runs no model; it only exposes deterministic tools and stores no
API keys.

The public-facing page is `/connect` (`apps/web/app/pages/connect.vue`).

## Tools

Each tool is annotated (`title` + `readOnlyHint`); reads and writes are separate
tools (a connector-directory requirement, see below).

| Tool | Kind | What it does |
| --- | --- | --- |
| `list_game_types` | read | The catalog (which games are ready-made vs building blocks) |
| `doot_format_guide` | read | The markdown game format, so Claude writes a valid game |
| `validate_doot_game` | read | Parse a markdown spec, return rounds + warnings to fix |
| `list_my_games` | read | List the account's games (id, title, visibility, remixable, link) |
| `save_game` | write | Save the game (+ description/visibility/remixable/cover/tags) and return a link |
| `update_game` | write | Replace one of the account's own games' rounds + settings (owner-checked) |
| `set_game_meta` | write | Change a game's settings (description/visibility/remixable/cover/tags/theme) without re-sending rounds |
| `upload_image` | write | Fetch an https image URL, re-host it on Doot, return a URL (round image or game cover) |

All tools run behind OAuth (`withMcpAuth`); an unauthenticated POST gets a 401 with
`WWW-Authenticate`, which is how Claude discovers the OAuth flow.

## How it is built

- **OAuth provider:** the better-auth `mcp` plugin (`server/utils/auth.ts`). It adds
  the oidc tables and the authorize/token/consent/dynamic-client-registration
  endpoints under `/api/auth`. `authOptions` uses `satisfies BetterAuthOptions` (not a
  `:` annotation) so the plugin api types (`getMcpSession`) reach `withMcpAuth`.
- **Discovery:** `server/routes/.well-known/oauth-protected-resource.get.ts` and
  `oauth-authorization-server.get.ts` (RFC 9728 + RFC 8414).
- **The endpoint:** `server/routes/mcp.ts` (stateless Streamable HTTP, JSON-RPC 2.0).
- **Consent screen:** `app/pages/oauth/consent.vue` posts the decision to
  `/api/auth/oauth2/consent`.
- **Migration:** `server/plugins/auth-migrate.ts` runs better-auth's schema
  statement-by-statement so the failing username UNIQUE-column ALTER on an existing
  `user` table does not block the new oidc CREATE TABLEs (verified on a prod-like DB).

## Security

- `save_game` writes only to `session.userId` and is validated through
  `gameInputSchema` (title <= 120, rounds <= 50). The theme is passed through (only if
  it is a known theme).
- `upload_image` is SSRF-guarded (`server/utils/fetch-image.ts`): https only; blocks
  private, loopback, link-local, cloud-metadata, CGNAT, NAT64, and 6to4 addresses,
  re-validating on every redirect hop; requires an image content-type; 5MB streamed
  cap; 10s timeout. Residual: DNS rebinding between lookup and connect is not fully
  closed (would need connect-to-pinned-IP).
- `/mcp` writes are throttled per user (30/min) in-memory (the per-IP middleware does
  not cover `/mcp`, and Claude traffic can share egress IPs).
- Open follow-ups from the audit: sweep expired `oauthAccessToken` and unused
  dynamic-client rows; show the connecting client's name on the consent screen.

## Publishing in Claude's connector directory

Custom connectors (add by URL) already work today with zero Anthropic involvement.
To be *listed* in the in-app directory so users find Doot without pasting a URL:

- **Path:** a manual review via the submission form (linked from
  https://claude.com/docs/connectors/building/submission ; remote-MCP form at
  https://clau.de/mcp-directory-submission ). Free, open to any developer, about two
  weeks.
- **Already met:** remote MCP over Streamable HTTP, OAuth (RFC 9728 PRM at
  `/.well-known/oauth-protected-resource`, dynamic client registration, PKCE S256),
  the `https://claude.ai/api/mcp/auth_callback` redirect, tool annotations, separate
  read/write tools, tool names <= 64 chars.
- **Done:**
  - A **privacy policy** at `/privacy` (the hard gate) and **terms of service** at
    `/terms`, both linked from the footer.
  - A **favicon** at `/favicon.svg` (the doot mark), registered in `nuxt.config.ts`.
- **Still to prepare:**
  - Accept the Anthropic Software Directory Terms + Policy at submission time.
  - A dedicated **square logo** asset for the submission form (the favicon covers the
    browser tab; the directory wants a larger square logo too). Every "allowed link
    URI" listed must be a doot.games origin.
  - **Public docs** with 3+ usage examples; a **test account** with step-by-step setup
    for reviewers.
  - If shipping an interactive in-chat UI ("Claude App"): MCP App resources + 3 to 5
    PNG screenshots >= 1000px, cropped to the app response (no GIF/video).
- **Review criteria:** https://claude.com/docs/connectors/building/review-criteria
  (the top rejection causes are missing tool annotations, which we have, and a
  missing privacy policy, which we now have).
