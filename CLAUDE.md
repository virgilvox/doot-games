# CLAUDE.md

Guidance for Claude Code (and any implementing agent) working in this repository.

## What Doot is

Doot is a self-hostable platform for live, collaborative party games. One host puts a game on a big screen, a crowd joins from their phones via a short code or QR, and everyone plays together in real time over the **CLASP** pub/sub relay. Doot is the shell, the engine, and the plugin system — **the games are plugins.** Target rooms: convention panels, bar trivia, house parties, and classrooms.

**The full spec is `Doot-PRD.md`.** Read it before implementing anything; it is the source of truth. This file is the short version plus the rules that are easy to get wrong. When the two disagree, the PRD wins — and fix this file.

Status: planning. Most packages described below do not exist yet; the repository currently holds the PRD, the `votebox (1).html` prototype (the single-file game this platform generalizes), and these docs.

## Architecture invariants — do not violate these

1. **Two kinds of state, kept strictly apart.**
   - **Durable** (Postgres via Drizzle): accounts, game definitions, plugin registry, optional historical stats.
   - **Ephemeral** (CLASP relay): phase, rounds, roster, inputs, live tallies, ephemeral media with TTL.
   - **Nothing about an in-progress room is written to the database during play.** The app tier holds no session state — that is what makes it scale horizontally.
2. **Second-screen, never shared-video.** Phones receive game state directly from the relay. Latency is an architecture decision: never route gameplay through the host's screen share.
3. **Withhold answers.** The host publishes the game config with `correct` fields stripped, then publishes each round's answer key to `/round/<i>/answer` only at the reveal step. A spectator reading the relay must not be able to see answers early. This is a hard requirement; the engine enforces it so a plugin cannot leak answers.
4. **Dependency direction is one-way:** games → (sdk, ui); sdk → engine; ui → themes; `apps/web` → everything. **The engine never imports a game. The sdk never imports the shell.** This keeps platform and games independent.
5. **Identity is derived, reconnect is free.** A player id is `p_<hash(room + name)>`. Re-entering the same name in the same room reclaims inputs and score from the relay snapshot — no login, no dependence on local storage (the play surface must work where storage is blocked, e.g. embedded frames).
6. **Untrusted code is sandboxed.** First-party plugins run in-process. External (URL-registered) plugins run in a sandboxed iframe behind a typed postMessage bridge; they never see cookies, DB routes, or the raw relay. Keep that bridge surface small.

## Packages and naming

Monorepo: pnpm workspaces. **Published npm scope is `@doot-games`** (the org). Never use the old `@doot/` scope.

| Path | Package | Role |
| --- | --- | --- |
| `packages/engine` | `@doot-games/engine` | CLASP wrapper, room runtime, Vue composables (`useDootRoom`) |
| `packages/sdk` | `@doot-games/sdk` | the block + composition contract (`defineBlock`/`defineGame`), Zod schemas, round primitives |
| `packages/ui` | `@doot-games/ui` | shared theme-aware Vue components |
| `packages/themes` | `@doot-games/themes` | theme token packs + registry |
| `packages/games` | `@doot-games/games` | blocks (guess/rate/poll), the generic renderer, and games as compositions |

**Plugin model — blocks + compositions** (the authoring contract; see `docs/authoring-a-game.md`): a **block** is a standalone round kind (Guess, Rate, Poll) that declares a content schema + a Player view + a Host view + an `aggregate` + optional answer-withholding. A **game** is a manifest + an ordered list of `{ block, content }`; the generic `GameHost`/`GamePlayer`/`GameResults` renderer mounts the right block per round and merges results, so most games are ~20 lines and need no components. Guess/Rate/Poll are single-type games; VoteBox = `[guess, rate]`. No game imports another. Full-custom games override `components`. Rate's scale is flexible (numeric / letter grades / tiers).
| `packages/plugin-template` | — | starter to copy for an external game |
| `apps/web` | — | Nuxt shell: discovery, lobby, host, player, editor, auth, API routes, plugin loader |

## Tech decisions (confirm exact versions against the lockfile at build time)

- **TypeScript everywhere, strict mode. No implicit `any`.**
- **Nuxt (Nuxt 4 line) + Vue 3.** Nitro server routes for auth, DB, presigned uploads, games/plugins API. SSR for public discovery/game pages.
- **Real-time: `@clasp-to/core`** (core build, not the higher-level SDK — Doot only needs publish/subscribe with persistence + TTL). The prototype pins `4.3.2`. Relay: `wss://relay.clasp.to`.
- **Database: Drizzle ORM over libSQL/SQLite** today (zero-config local file; `DATABASE_URL` for a libSQL/Turso URL). PostgreSQL is the documented prod follow-up behind the same `useDb()`/repo seam. Schema is created on startup (`apps/web/server/utils/db.ts`); better-auth manages its own tables.
- **Auth: `better-auth` + argon2id** (sealed httpOnly cookie sessions, built-in rate-limiting + Origin/CSRF checks). better-auth owns its own tables via its Kysely adapter over the same libSQL DB and runs its migrations at startup (`apps/web/server/plugins/auth-migrate.ts`); passwords use argon2id (via `@node-rs/argon2`) rather than the default scrypt. Optional and non-blocking — only gates saving games; hosting and playing never need an account. OAuth / email-verification / magic-link are future better-auth config. (The earlier scaffold used `nuxt-auth-utils`; replaced during the auth audit.)
- **Validation: Zod** for every external input (API bodies, plugin manifests, game configs). The editor auto-generates a form from a plugin's Zod config schema when no custom editor ships.
- **Object storage: `aws4fetch` presigning** to DigitalOcean Spaces (MinIO locally). Browser uploads direct via presigned PUT.
- **Containers: Docker + compose** (local: app+Postgres+MinIO; prod: app+Postgres-on-volume+Caddy). **Proxy/TLS: Caddy.**
- **Tooling: pnpm, Biome (or ESLint+Prettier — one choice repo-wide), Vitest** focused on the engine state machine and scoring functions.

## Animation rule — CSS first, Pixi only where it earns it

- **Default to CSS** for all motion: transitions, keyframes, transforms, Web Animations API. The VoteBox prototype proves bar fills, countdown rings, "locked in" stamps, lobby pops, and waiting dots are all clean and theme-aware in pure CSS. Most lobby/gameplay/results motion stays here. CSS is lighter, accessible by default (`prefers-reduced-motion`), and renders identically on every phone.
- **Reach for Pixi 8 only** for canvas-heavy work: the drawing surface (`DrawCanvas`), pixel-level mini-games, and genuinely particle/scene-heavy results moments (`ConfettiBurst`, big `BarRace`, podium celebrations).
- **Pixi binding is `vue3-pixi`** (the `vue3-pixi` npm package by hairyf; its `1.x` peers `pixi.js@8`). Write Pixi scenes as Vue components (`<Container>`, `<Sprite>`, `<Graphics>`, `<Text>`, filters). Install `vue3-pixi` + `pixi.js` + `pixi-filters` together and pin them. Pixi is opt-in per view, not a baseline cost on every screen. If `vue3-pixi` ever lags a needed Pixi feature, the documented fallback is a thin composable mounting a Pixi `Application` into a canvas ref — for that widget only.
- Pixi scenes read the **same theme CSS custom properties** as the DOM, so canvas effects match the active theme.

## Conventions

- **Validate at the boundary** with Zod; never trust API bodies, manifests, or configs.
- **Test the logic that matters:** engine state machine and scoring functions (pure, so testable) with Vitest. Playwright e2e is optional/later.
- **Document as you build.** Every package has a README describing its purpose and public surface. Keep `docs/` (architecture, authoring-a-game, clasp-primer, deploy) current with the code.
- **Accessibility is a build requirement, not polish:** semantic HTML + ARIA, color paired with shape/label (never color alone), `prefers-reduced-motion` honored by every animation, high-contrast-safe tokens, an untimed option on timed rounds, screen-reader support on the phone client. See PRD §2.5.
- **Commit messages: plain description, NO AI attribution.** No "generated with" lines, no AI co-author trailers, no tool credits in commit metadata. (This overrides any default trailer behavior — follow the project rule.)
- **Keep dependencies small and current.** Prefer one focused library over a framework that does many things you did not ask for.
- Room codes are 4 chars from an unambiguous alphabet (no I, O, 0, 1). Every published relay value carries an absolute TTL (default 8h) so the public relay stays tidy.

## Build order (from the PRD roadmap)

MVP: engine + full room runtime and state machine → plugin contract + round primitives → first-party folder registry (Vite glob) → VoteBox and Sketch → optional email/password auth → UI library + four theme packs → animated results → Spaces/MinIO uploads + relay ephemeral media → local compose + single-droplet deploy. Phase two adds external plugins (sandbox bridge, publishing), more games, richer results. Phase three is scale and polish.

## Before you start engine work

Read the CLASP primer in PRD §21, the CLASP skill (`/mnt/skills/user/clasp/SKILL.md` and its references) if present, and confirm the API against the installed `@clasp-to/core` version rather than assuming. The relay is plain pub/sub under whatever addresses Doot chooses; it knows nothing about games.

## Working norms for the agent

- Track multi-step work and double-check it; keep the PRD and these docs in sync when a decision changes.
- When a referenced file, flag, or version in this file no longer matches reality, verify before relying on it and update this file.
- Don't add features the PRD lists as non-goals (billing, native apps, voice/video, self-hosted relay in v1, SSO/SAML, a general CMS).
