# Plugin authoring roadmap (how anyone builds a Doot game)

The plan for letting people author games across the whole skill range on **one
continuous surface** where each step degrades gracefully into the next. Complements
[`external-plugins.md`](./external-plugins.md) (the security/runtime design for
*untrusted* plugins) and [`authoring-a-game.md`](./authoring-a-game.md) (today's
first-party contract). When this and the PRD disagree, the PRD wins; fix this file.

Grounded in a 2026 survey of how comparable tools do it: Figma (sandbox = boundary,
not review), Obsidian/Raycast (repo-link ingestion), itch.io/Discord (separate-origin
iframe), Sandpack/`@vue/repl` (in-browser compile+preview), Kahoot/Gimkit/GDevelop/
Twine/Construct 3 (non-coder UX), the 2025 remote-MCP OAuth spec.

## Who this is for — and the order that implies

**The primary user is a non-developer** (the platform's whole ethos: "how will a
regular person at a party host/play/customize this?"). For *authoring*, that's a
teacher or a host who wants a custom game, not a programmer. Coders and AI-agent
authors are a real but **minority** audience.

So the tiers run non-coder → coder, and **the build order starts at the bottom**, not
the top. The hard, exciting infrastructure (sandbox iframe, in-browser code editor,
MCP server) serves the minority and is mostly **not on the primary user's path** — and
critically, the primary-user work is **not blocked by any of it**. Build the bottom of
the ladder first. (This corrects an earlier draft that sequenced the coder tiers first;
the audit flagged the center of gravity as inverted.)

## The thesis: tiers, not modes

Shipping "a form editor" **or** "a code editor" as a fork would be the mistake. Every
tool people love — Construct 3, Twine, GDevelop, Lovable — makes the common case
trivial and the complex case *reachable from the same place* without an all-or-nothing
mode switch. Doot's blocks-and-compositions model is already that architecture
(mechanic decoupled from content, a small vocabulary, ~20-line games). The job is to
make the escape hatches continuous.

| Tier | Audience | What it is | Status |
| --- | --- | --- | --- |
| **0 — Template & form** | teachers, hosts — **the 80%** | Remix a complete example, fill the auto-generated Zod form per `{block, content}` round | **Shipped, needs party-ready polish** (gallery, host preview, AI content) |
| **1 — Rich schema controls** | power authors, designers | Same forms, friendlier + custom field renderers (answer-key editor, media, color/theme, conditional fields) | Partial — extend `SchemaForm` |
| **2 — Paste-in canvas round** | JS-comfortable creators | A sandboxed `CanvasBlock` (a Pixi/Three/2D scene against a tiny helper API) | New build |
| **3 — Full code editor** | coders | In-browser multi-file editor + compile + dual preview, full `defineGame` | New build |
| **AI assist** | all tiers | Generate → preview → iterate, layered across 0–3 | New build (two rails ↓) |

**Engineering invariants that hold at every tier:** live preview is constant; Zod
validation is constant; the same `defineBlock`/`defineGame` contract is the target;
the engine owns the relay, phases, reconnect, and answer-withholding (a tier never
reimplements these). A user graduates tiers without restarting their game.

**Accessibility invariants that hold at every tier** (a11y is a *build requirement*,
PRD §2.5 — not polish, and easy to silently drop here):
- The **host chrome owns the a11y-critical surface**: prompt text, image, the timer,
  the **untimed/accuracy option**, lobby, results. These render in trusted Doot DOM
  (as `GamePlayer`/`GameHost` already do) *above/around* any plugin frame, so the core
  round is screen-reader-legible even when the plugin draws an opaque canvas.
- Every block (incl. canvas) gets `reducedMotion` in its state and **must** honor it.
- A canvas/opaque block **must declare a text representation** of its current state and
  inputs (an `a11yLabel` / live-region string the host renders outside the canvas) and
  use color **with** shape/label, never color alone. Reject blocks that don't.
- The author-time harness **lints a11y** (axe-core) and blocks publish on violations —
  the platform can't inspect a cross-origin frame at runtime, so author-time + trusted
  chrome are the only enforcement points (see Security & a11y tension below).

## Tier 0 — Template & form (the primary surface; polish it first)

`apps/web/app/components/GameEditor.client.vue` + `packages/ui/src/schema-form/`
already auto-generate an editor from a block's Zod `contentSchema`. What a regular
person actually hits first is under-built, and **none of it needs the sandbox, the
bridge, `@vue/repl`, or MCP** — it's plain product work on the existing editor:

- **Never a blank page.** "Create → pick a type" today yields a near-empty composition
  — a blank page with a title. Build a **template/remix gallery**: a wall of complete,
  playable example games you clone-and-tweak. The fork API already exists
  (`server/api/games/[id]/clone.post.ts`); this is UI + curated content.
- **Preview the big screen, not just the phone.** The editor previews only "as players
  see it" (the phone). The host's *primary* artifact is the TV/projector. Add a
  **`HostDisplay` preview pane** beside the phone pane — the block contract already
  exposes `HostDisplay`, so the data is there. ← **building this now** (see Build order).
- **In-app AI content generation.** Today's "AI" is a copy-prompt-to-ChatGPT clipboard
  hack. Turn it into "type a topic → filled-in rounds appear in the editor → tweak,"
  built on the existing markdown round-trip (`parseMarkdownGame`). Runs in **trusted
  app chrome** (never the plugin frame — the plugin origin's `connect-src 'none'`
  forbids network there). Key custody per AI rails below.
- **Authoring guardrails.** Validation today is correctness-only. Add quality nudges
  ("3 rounds is short," "mix up your round types," "no timer anywhere — add one or mark
  it untimed") and the a11y affordances above. Sane non-blank defaults; undo.

## Tier 1 — Rich schema controls (custom-renderer registry)

Schema-driven forms are great for structured content, weak for rich controls *unless
you can register custom widgets*. Adopt the shadcn-vue AutoForm `INPUT_COMPONENTS` /
JSONForms custom-renderer pattern: a field maps to a named renderer (answer-key editor,
media uploader, color/theme picker), resolved from a registry — no hand-built editor
per block. Conditional/dependent fields come from the same layer. This is also where
the forms get *friendlier* for non-coders (authored labels/help, not just humanized
field names). Plan the escape hatch in from day one.

## Tier 2 — Paste-in canvas round (a distinct `CanvasBlock`, not a `RoundBlock`)

A sandboxed block where the author writes a self-contained Pixi 8 / Three.js / 2D scene
against a tiny helper API — the Construct-3 escape hatch, scoped to **one round**.

**Correction (audit):** a canvas block **cannot be a `RoundBlock`.** A `RoundBlock`
(`sdk/src/block.ts`) is trusted in-process Vue components **plus pure functions** the
host runs directly — `aggregate`, `redactContent`, `answerOf`, `derive`, `toVoteText`.
Untrusted canvas code lives behind the iframe bridge and can only `submit`; it can't
hand those functions to the host process. So define a **separate `CanvasBlock`
artifact**:
- It provides a sandboxed render + `submit`, and declares its `contentSchema`,
  `inputSchema`, and answer **shape as data (Zod)** so the *trusted host* does
  redaction, withholding, validation, and a **declarative** aggregate (e.g. "score =
  exact match on field X"), never author code in-process.
- **Single-round only in v1**: no `derive`/`toVoteText` across the bridge, so a canvas
  block can't be a make/judge round in a two-phase game yet.
- Helper API — **in:** `onState({ content, myInput, phase, players, theme,
  reducedMotion })`, theme tokens as CSS custom properties; **out:** `submit(input)`,
  `resize(h)`; **withholding:** `onReveal(key)` fires only at reveal. Plus the required
  `a11yLabel` text channel.
- **Deps are a vendored, pinned allowlist** (Vue runtime, `pixi.js@<pin>`,
  `pixi-filters`, `three@<pin>`) served from Doot's origin — **not** open CDN imports
  (keeps it hermetic *and* working offline for self-hosters; see hermetic note below).

## Tier 3 — Full code editor (reuse the compiler, build the preview)

A multi-file in-browser editor with compile + **dual live preview** (player + host).
**Tech:** `@vue/repl` (MIT) for the **client-side SFC compiler** (genuinely reusable,
self-hostable), **CodeMirror 6** default (~50–200 kB, mobile-friendly), **Monaco** as
a lazy-loaded advanced mode. The whole editor route is **desktop-targeted, lazy, and
code-split out of the play surface** (never shipped to phones).

**Correction (audit):** `@vue/repl`'s `Preview` is a **same-origin srcdoc** iframe — it
is *incompatible* with the null-origin `plugins.doot.games` sandbox. We get the
**compiler** for free but must **build the preview harness ourselves**: compile in the
parent, ship the compiled module + the vendored import map across the bridge into the
null-origin frame, which boots its own Vue + block renderer. A same-origin preview is
acceptable **only** while an author edits *their own* code (they can only attack their
own session); the moment a preview shows *someone else's* unreviewed plugin (remix,
gallery), it **must** be the null-origin frame.

**Hermetic claim, corrected:** in-app compile sidesteps the **build-script** supply-chain
class (no `npm install`, no postinstall). It does **not** sidestep runtime deps: author
`import`s resolve through an import map, and that map must point at a **vendored,
version-pinned, self-hosted allowlist** — never arbitrary CDN imports (CDN compromise/
drift, and broken for offline self-hosters). Repo/zip import stays prebuilt-bundle-only,
SHA-pinned.

**No cross-origin isolation, ever.** The compiler is pure-JS and needs no
`SharedArrayBuffer`/COEP. Enabling COOP/COEP on `doot.games` would break embedded-frame
play (a hard invariant) and better-auth OAuth popups. If QuickJS-WASM is ever adopted,
it uses the non-SAB interrupt path or runs on the already-isolated plugin origin.

## AI assist — two rails

1. **Doot SDK MCP server (the powerful rail).** A remote OAuth 2.1 MCP server exposing
   `list_blocks` / `get_block_schema` / `scaffold_game` / `validate_manifest` /
   `preview_url`, so a user's *own* Claude builds plugins against the **real** schemas —
   **zero API-key custody**, user pays their own tokens, grounded generation. Pattern
   shipped by Vercel/Cloudflare/Salesforce.
   **Correction (audit): this is NOT "no infra coupling."** It is the largest new server
   component here: a stateful OAuth *authorization server* (RFC 9728 metadata, PKCE,
   RFC 8707 audience-bound tokens, dynamic client registration + consent + token
   rotation), which better-auth does **not** provide. It needs durable token/client
   storage (SQLite ok — but TTL-GC anonymous DCR clients and rate-limit registration),
   and likely its **own origin** (`mcp.doot.games`). **Adopt a vetted MCP-OAuth
   library**, don't hand-roll the spec; sequence it **after** the editor, not in
   parallel, unless a second owner takes it.
2. **In-app assistant (the friendly rail — higher primary-user value).** "Describe your
   game → preview → iterate" in trusted app chrome (Tier-0 content gen above). If BYOK,
   **never store the key in the DB** — secret manager / gateway with scoped virtual
   keys; prefer platform-metered. The clipboard hack is the zero-custody fallback today.

## Trust & moderation UX (for the non-coder host)

The sandbox gives *technical* safety. A host putting a community game on a TV needs
*social/content* safety, which is a UX problem the runtime model doesn't solve:
- **Design the "unreviewed" badge in plain language** ("Doot hasn't checked this game —
  it can't see your account or data, but its content isn't moderated"). Name + words +
  placement, not just a flag.
- **A report/hide path** from the host's POV; block a publisher.
- **Trust signals the primary user understands**: play counts, ratings, "hosted 200×,"
  Doot-reviewed/featured — surfaced at the point of choosing a game. `@handle` provenance
  is necessary but insufficient (the host knows no publishers).

Build this **before** external community plugins ship, not after.

## Security model (recap + hardening)

Runtime boundary is in [`external-plugins.md`](./external-plugins.md): untrusted plugins
run `<iframe sandbox="allow-scripts">` (null origin, **no** `allow-same-origin`) on a
separate origin, behind a Zod-validated `MessageChannel` bridge; `connect-src 'none'`;
answer withheld until reveal. **Sandbox is the boundary, not review.** Pinned facts:

- **Host-only cookies are a hard invariant.** No cookie `domain`, no
  `crossSubDomainCookies`, so the session never reaches `plugins.doot.games` — *that* is
  what makes a subdomain safe. Any future `.doot.games` cookie or `crossSubDomainCookies`
  leaks the session into the plugin origin. See [[doot-plugin-origin-cookie-coupling]].
- **The plugin origin is live.** `plugins.doot.games` → the `doot-prod` droplet, valid
  cert, strict CSP, never proxied to the app. Serves a placeholder `respond` today;
  Phase 1 swaps to `file_server` over the real host shell.

**Hardening applied to the shipped bridge (from the audit):**
- **Handshake source-pinning.** `connectToHost` now accepts the bootstrap port only from
  `window.parent` and only on the typed `BOOTSTRAP` message — closes a port-hijack where
  a nested/sibling frame could race the port and forge host messages (incl. a fake
  `answer`). `targetOrigin '*'` is unavoidable for a null-origin frame, so source-pinning
  on the plugin side is the load-bearing control.
- **Enforcement lives in the bridge, not an unwritten caller.** `createPortHost` now
  rate-limits inbound messages, **size-caps** every message (relay/phone/DB DoS), and
  **phase-gates** `submit` (drops submits outside the open phase and after the first
  accepted submit per round). The host must *still* re-validate `submit.input` against
  the block's own schema before publishing.
- **`img-src` exfil channel closed.** `connect-src 'none'` does **not** mean "can't
  exfiltrate" while `img-src https://media.doot.games` is allowed — a plugin can beacon
  data as an image URL. The plugin-origin CSP drops third-party `img-src`; platform
  media is handed over the bridge as content, not as a fetchable URL the plugin builds.
- **Protocol version negotiation.** Pinned, immutable plugins can't be patched when the
  host evolves, so `init`/`ready` now carry a `protocolVersion`; the host refuses (red-
  badges) incompatible majors instead of hanging the round.

**Bundle hosting (resolve before wiring in):** CSP is a property of the *document*. A
plugin bundle loaded from `esm.sh` would run under the shell's `script-src 'self'` and
be **blocked** — so Doot must **re-host registered bundles same-origin** on
`plugins.doot.games` (fetch at registration with SSRF guards, SHA-pin, serve under the
strict CSP). Never widen `script-src` to a CDN.

**Security ↔ a11y tension (stated honestly):** the platform **cannot** guarantee the
accessibility of arbitrary UI inside a cross-origin frame it can't inspect — a `<canvas>`
is opaque to screen readers by default. Mitigation, by tier: (1) **author-time axe-core
lint** in the harness blocks publish on violations; (2) **trusted chrome owns** prompt/
timer/untimed/results so the core round is always legible; (3) canvas blocks **must**
declare an `a11yLabel` text channel and honor `reducedMotion`; (4) the reviewed/featured
tier adds a manual a11y checklist; unlisted carries an "unreviewed accessibility" badge.

## The bridge must grow to host real blocks (honest cost)

Today's protocol — host→plugin `{init, round, state, answer}`, plugin→host
`{ready, submit, resize}` — does **not** carry what the in-process renderer carries.
"First-party blocks through the iframe" (build step below) requires extending it with:
a **reveal** message (the `revealSummary`/`PlayerReveal` payload), a **host-view inputs
+ roster** snapshot (`HostDisplay` draws live tallies from an inputs `Map`), a **theme
update** message (theme can change mid-room), and a **public results fragment** shape
(today `state.results` is opaque `z.unknown()`). Reactivity is lost across postMessage —
the host must diff and re-send `state` per input and the plugin rebuilds its view. Open
question: **host views may stay in-process** (they're trusted render) to shrink the
bridge surface. Mixed-trust two-phase is out of scope for the first iframe milestone.

## Ingestion (three doors, one stored artifact)

1. **In-app editor → stored source (canonical).** Author builds in the editor; Doot
   stores source + schema as a versioned, immutable snapshot. No git/CI/npm — a
   self-hoster gets this with zero extra infra.
2. **Manifest URL → prebuilt bundle (existing design).** Author self-hosts a built ES
   module + `plugin.json`; Doot fetches (SSRF-guarded), re-hosts same-origin, SHA-pins,
   registers. Manifest carries `minProtocol`/`engines`. (`external-plugins.md`.)
3. **Repo / zip import (convenience).** Pull a tagged release's **prebuilt** assets, or a
   zip; content-hash, scan, store. Converges to the same artifact. Only ever build
   server-side in an ephemeral, network-restricted container with `--ignore-scripts` +
   frozen lockfile — and prefer not to build at all.

Registry tiers: unlisted (host-it-yourself) → open pinned (community/unreviewed badge) →
reviewed/featured. Provenance via `@handle`, plus the trust signals above.

## Build order (ethos-first)

The primary-user work (1) is unblocked by all the infrastructure and ships visible value
to a party host now. The sandbox/coder tiers follow.

1. **Tier 0/1 — the primary surface (do first; no sandbox/bridge/editor/MCP needed):**
   1a. **Big-screen `HostDisplay` preview** in the editor. ← **in progress this turn.**
   1b. **Template/remix gallery** (kill the blank page; reuses the clone API).
   1c. **In-app AI content generation** (topic → filled rounds; markdown round-trip).
   1d. **Custom-renderer registry** + authoring quality/a11y guardrails.
2. **Harden the shipped sandbox.** Origin live ✅, `@doot-games/plugin-bridge` shipped ✅;
   apply the security hardening above (source-pin, rate/size/phase caps, protocol
   version, `img-src`) and decide same-origin bundle re-hosting **before** wiring the
   bridge into `apps/web`.
3. **First-party blocks through the iframe.** Extend the protocol (reveal/inputs/roster/
   theme/results — see "the bridge must grow"); decide host-view in-process vs in-frame.
4. **Tier 2 `CanvasBlock`** — distinct artifact, single-round, host-side declarative
   scoring, vendored-pinned pixi/three, required `a11yLabel`.
5. **Tier 3 in-app editor** — `@vue/repl` compiler + custom null-origin preview harness;
   desktop-only, code-split off the play surface.
6. **Doot SDK MCP server** — new authenticated service (own origin + durable token store);
   adopt an MCP-OAuth library; after the editor.
7. **External registration + registry tiers** + trust/moderation UX.

## Open decisions

- **Plugin origin: subdomain vs separate registrable domain.** Subdomain now (safe while
  cookies are host-only). Revisit only for cross-site hardening; **never** enable COEP on
  `doot.games`.
- **Host views: in-process vs in-frame.** Leaning in-process (trusted render) to keep the
  bridge small.
- **Where the editor lives.** A `@doot-games/plugin-editor` package vs an `apps/web`-only
  component. Lean package, to match the bridge/dev split.
- **AI metering for the in-app assistant.** BYOK-via-gateway vs platform-metered. The MCP
  rail sidesteps key custody.

## What already exists (don't rebuild it)

- **`@doot-games/plugin-bridge`** — the shipped, tested host/plugin transport + Zod
  protocol (being hardened per the audit).
- **Working dev harness:** `examples/external-plugin/` — `npx vite` → `/dev-host.html`.
- **Schema-driven editor:** `GameEditor.client.vue` + `packages/ui/src/schema-form/`.
- **The authoring contract:** `@doot-games/sdk` (`defineBlock`/`defineGame`).
- **The full security design:** `docs/external-plugins.md`.
