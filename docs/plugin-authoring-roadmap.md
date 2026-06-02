# Plugin authoring roadmap (how anyone builds a Doot game)

The plan for letting people author games across the whole skill range — a teacher
filling in a form, a designer wiring rich controls, a coder writing a custom Pixi
round, an AI agent building against the SDK — on **one continuous surface** where
each step degrades gracefully into the next. This complements
[`external-plugins.md`](./external-plugins.md) (the security/runtime design for
*untrusted* plugins) and [`authoring-a-game.md`](./authoring-a-game.md) (today's
first-party contract). When this and the PRD disagree, the PRD wins; fix this file.

Grounded in a 2026 survey of how comparable tools actually do it: Figma (sandbox =
boundary, not review), Obsidian/Raycast (repo-link ingestion), itch.io/Discord
(separate-origin iframe), Sandpack/`@vue/repl` (in-browser compile+preview),
Kahoot/Gimkit/GDevelop/Twine/Construct 3 (non-coder UX), and the 2025 remote-MCP
OAuth spec.

## The thesis: tiers, not modes

The biggest mistake would be to ship "a form editor" **or** "a code editor" as a
fork. Every tool people actually love — Construct 3, Twine, GDevelop, Lovable —
makes the common case trivial and the complex case *reachable from the same place*
without an all-or-nothing mode switch. Doot's blocks-and-compositions model is
already that architecture (mechanic decoupled from content, a small primitive
vocabulary, ~20-line games). The roadmap is to make the escape hatches continuous.

**Invariants that hold at every tier:** live preview is constant; Zod validation is
constant; the same `defineBlock`/`defineGame` contract is the target; the engine
still owns the relay, phases, reconnect, and answer-withholding (a tier never
reimplements these). A user graduates tiers without restarting their game.

| Tier | Audience | What it is | Status |
| --- | --- | --- | --- |
| **0 — Template & form** | teachers, hosts, the 80% | Remix a template, fill the auto-generated Zod form per `{block, content}` round | **Shipped** (`GameEditor`, `SchemaForm`). Add: template gallery, "remix this", CSV/AI content import |
| **1 — Rich schema controls** | power authors, designers | Same forms, but custom field renderers (answer-key editor, per-option media, color/theme, conditional fields) | Partial. Add a **custom-renderer registry** to `SchemaForm` |
| **2 — Paste-in canvas round** | JS-comfortable creators | A "canvas block": author writes a Pixi/Three/Canvas scene against a tiny helper API, sandboxed, live preview | **New build** |
| **3 — Full code editor** | coders | In-browser multi-file editor + compile + dual preview, the full `defineGame` with `components` overrides | **New build** |
| **AI assist** | all tiers | Generate → preview → iterate, layered across 0–3 | **New build** (two rails ↓) |

### Tier 0 — Template & form (shipped; polish)
`apps/web/app/components/GameEditor.client.vue` + `packages/ui/src/schema-form/SchemaForm.vue`
already auto-generate an editor from a block's Zod `contentSchema` with a live phone
preview. The gap is the *cold start*: never show a blank page. Add a **template
gallery + "remix this game"** (clone any public game into the editor) and **bulk
import** (CSV/paste, and AI generation) for question/content pools — the proven
Gimkit/Kahoot/QuestionWell pattern.

### Tier 1 — Rich schema controls (custom-renderer registry)
Schema-driven forms are excellent for structured content and weak for rich controls
*unless you can register custom widgets*. Adopt the shadcn-vue AutoForm
`INPUT_COMPONENTS` / JSONForms custom-renderer pattern: a block declares a field
maps to a named renderer (answer-key editor, media uploader, color/theme picker),
and `SchemaForm` resolves it from a registry — no hand-built editor per block.
Conditional/dependent fields (show X when Y) come from the same layer. Plan the
escape hatch into the form layer from day one; auto-generation alone never covers a
genuinely custom round.

### Tier 2 — Paste-in canvas round (the highest-leverage new thing)
A first-class **canvas block** where the author writes a self-contained Pixi 8 /
Three.js / 2D-canvas scene against a tiny, typed helper API and sees it render live.
This is the Construct-3 escape hatch: scoped to **one round**, not the whole game,
so a non-expert can go deep in a small, safe box. The helper surface is exactly the
bridge, dressed up ergonomically:

- **in:** `onState({ content, myInput, phase, players, theme })`, theme tokens as
  CSS custom properties (canvas matches the active theme, per the animation rule).
- **out:** `submit(input)` (one verb), `resize(h)`.
- **withholding:** the answer arrives only via `onReveal(key)` — the author *cannot*
  read it early, by construction.

Renders inside the sandboxed plugin iframe (below). Pixi/Three are normal ESM deps
resolved through a pinned import map. This is where "advanced custom game" stops
meaning "fork the platform."

### Tier 3 — Full code editor (don't hand-build it)
A multi-file in-browser editor with compile + **dual live preview** (player view and
host view side by side, fed the same compiled module with different roles — mirroring
the generic `GamePlayer`/`GameHost` renderer). **Tech: `@vue/repl`** (MIT, the engine
behind play.vuejs.org) for in-browser SFC compile+preview, **CodeMirror 6** as the
default editor (~50–200 kB, mobile-friendly), **Monaco** as a lazy-loaded "advanced
mode" with full TS IntelliSense. `@vue/repl` supports both editors natively and lets
us **self-host the compiler/runtime** (critical: Doot is self-hostable). Avoid
StackBlitz WebContainers (commercial license for for-profit, no public self-host,
app-wide COOP/COEP headers that would collide with Doot's embedded-frame play surface
and OAuth) and Sandpack-for-Vue (pushes onto the proprietary Nodebox path).

**Key reconciliation:** `external-plugins.md` says *"Doot does not build untrusted
source."* The in-app editor stores source — but `@vue/repl` compiles **client-side,
hermetically, with no `npm install`**, so we never run an author's build scripts or
touch the npm-postinstall supply-chain class (Shai-Hulud et al.). The in-app editor
*is* the no-build path. Repo/zip import stays prebuilt-bundle-only, SHA-pinned.

## AI assist — two rails

1. **Doot SDK MCP server (flagship).** An OAuth 2.1 remote MCP server (RFC 9728
   protected-resource metadata, PKCE/S256, RFC 8707 audience-bound tokens, CIMD/DCR
   registration) exposing tools like `list_blocks`, `get_block_schema`,
   `scaffold_game`, `validate_manifest`, `preview_url`. A user's *own* Claude
   (Claude Code / desktop) authenticates and builds plugins against the **real**
   schemas. Why this is the primary rail: **zero API-key custody** for Doot, the user
   pays their own tokens, and generation is grounded in the actual contract instead
   of hallucinated. This is the exact pattern Vercel, Cloudflare, and Salesforce
   already ship. Security is textbook (HTTPS, exact redirect-URI match, short-lived
   tokens + rotation, SSRF guard on CIMD fetch, per-client consent).
2. **In-app assistant (secondary).** "Describe your game → preview → iterate" inside
   the editor (Lovable/v0 UX). If bring-your-own-key, **never store the key in
   Postgres** — route through a secret manager / gateway with workspace-scoped
   virtual keys. Prefer platform-metered or the MCP rail to avoid key custody.

## Security model (recap + what's new)

The runtime boundary is fully specified in [`external-plugins.md`](./external-plugins.md):
untrusted plugins run in a `<iframe sandbox="allow-scripts">` (null origin, **no**
`allow-same-origin`) on a separate origin, behind a tiny Zod-validated
`MessageChannel` bridge; `connect-src 'none'`; the answer key is withheld until
reveal by construction. **The sandbox is the boundary, not code review** (Figma's
own conclusion). Two additions this roadmap pins down:

- **Host-only cookies are now a hard invariant.** Doot's better-auth config sets no
  cookie `domain` and does not enable `crossSubDomainCookies`, so session cookies are
  scoped to `doot.games` exactly and are **not** sent to `plugins.doot.games`. This
  is *what makes a subdomain a safe plugin origin.* Never set a `.doot.games` cookie,
  never enable `crossSubDomainCookies`. (Upgrade path for belt-and-suspenders: move
  the plugin origin to a separate registrable domain so it is cross-site, not just
  cross-origin. Not required while cookies stay host-only.)
- **The plugin origin exists.** `plugins.doot.games` → the `doot-prod` droplet (DNS
  live). Caddy serves it as a **static, locked-down origin** (the CSP above), never
  reverse-proxied to the app. Today: a placeholder `respond`. Phase 1: swap to
  `file_server` over the built host shell + bridge. See `docker/Caddyfile`.

Defense-in-depth option for later (Figma's model): run plugin *logic* in
QuickJS-WASM inside the frame (kill-switch via memory limit + interrupt, DOM-less,
escape-resistant) and render through a trusted renderer. Not needed for Phase 1–2;
the origin-iframe + bridge + withholding already satisfies the three boundaries
(capability, information, availability).

## Ingestion (three doors, one stored artifact)

1. **In-app editor → stored source (canonical).** Author builds in the editor; Doot
   stores the source + content schema in the durable store as a versioned, immutable
   snapshot. No git, no CI, no npm — a self-hoster gets this with zero extra infra.
2. **Manifest URL → prebuilt bundle (existing design).** Author self-hosts a built
   ES module + `plugin.json`; Doot fetches, SHA-pins, registers. No platform-side
   build. (`external-plugins.md`.)
3. **Repo / zip import (convenience).** Pull a tagged release's **prebuilt** assets
   (Obsidian/`.vsix` model) or accept a zip; content-hash, scan, store. Converges to
   the same versioned artifact as door 1. Only ever build server-side in an
   ephemeral, network-restricted container with `--ignore-scripts` + a frozen
   lockfile — and prefer not to build at all.

Registry tiers stay as designed: unlisted (host-it-yourself) → open pinned
(community/unreviewed badge) → reviewed/featured (may widen `connect-src`). Provenance
via the existing `@handle` (verified-publisher model), not artifact signing.

## Build order

Maps onto `external-plugins.md` phases 0–4; each step is the smallest safe increment.

1. **Plugin origin (done/in-flight).** `plugins.doot.games` DNS ✅; Caddy locked-down
   static origin staged in `docker/Caddyfile` (goes live on next deploy, auto-cert).
2. **Graduate the harness → packages.** `examples/external-plugin/{bridge.ts,
   dev-host.html,...}` (already a working mock host + bridge inspector) becomes
   `@doot-games/plugin-bridge` (protocol + host iframe manager + `connectToHost`) and
   `@doot-games/plugin-dev` + `create-doot-game`. ← external-plugins.md Phase 0–1.
3. **First-party blocks through the iframe.** Render built-in games via the bridge
   from the `plugins.doot.games` shell. Proves the boundary with trusted code.
4. **In-app tiered editor.** `@vue/repl` + CodeMirror, dual player/host preview
   through the *same* bridge — this doubles as the non-coder harness. Add the Tier-1
   custom-renderer registry and the Tier-2 canvas block.
5. **Doot SDK MCP server.** Parallel track, no infra coupling, high ROI.
6. **External registration + registry tiers.** Manifest-URL/zip/repo import, SHA pin,
   unlisted → pinned → reviewed. ← external-plugins.md Phase 2–4.

## Open decisions

- **Plugin origin: subdomain vs separate registrable domain.** Subdomain now (cheap,
  safe while cookies are host-only). Revisit if we ever need cross-site hardening or
  COEP isolation for QuickJS/SharedArrayBuffer.
- **Where the editor lives.** A `@doot-games/plugin-editor` package (importable,
  reusable in the dev harness and the app) vs an `apps/web`-only component. Lean
  package, to match the bridge/dev split.
- **AI metering for the in-app assistant** (if we ship rail 2): BYOK-via-gateway vs
  platform-metered credits. The MCP rail (rail 1) sidesteps this entirely.
- **Canvas block fidelity.** How much Pixi/Three surface to expose through the helper
  API before it's "just write a full block" (Tier 3).

## What already exists (don't rebuild it)

- **Working dev harness:** `examples/external-plugin/` — `npx vite` → `/dev-host.html`
  embeds a plugin in the production sandbox, speaks the real bridge, scripts
  lobby→round→reveal→results, fakes other players, withholds the answer, and flags
  off-protocol messages. This *is* the contract; build against it.
- **The bridge:** `examples/external-plugin/bridge.ts` (Zod-validated, both sides).
- **Schema-driven editor:** `GameEditor.client.vue` + `SchemaForm.vue`.
- **The authoring contract:** `@doot-games/sdk` (`defineBlock`/`defineGame`).
- **The full security design:** `docs/external-plugins.md`.
</content>
</invoke>
