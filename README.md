<div align="center">

# 🎉 Doot

**Self-hostable, open-source live party games for the big screen.**

Put a game on the TV or projector. Everyone joins from their phone with a code or QR. Guess, rate, draw, vote, and crown a winner, together, in real time.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-live-brightgreen.svg)](https://doot.games)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

</div>

---

> **Live at [doot.games](https://doot.games).** The full loop works: pick or compose a game in the schema-driven editor (or import one from markdown), host it on a big screen, players join from their phones over the CLASP relay, play, and see animated results. **82 tests pass** (plus one opt-in live relay test), every package typechecks, and the app deploys on a single droplet via git push. Built-in: the **engine** (room runtime + state machine), the **block SDK**, a five-pack **theme system**, the theme-aware **UI library**, **seven games** (Guess, Rate, Poll, Rank, Draw, VoteBox, Custom) built from composable blocks, optional **better-auth** accounts with saved/shareable games, presigned image **uploads**, and the **Nuxt shell**. Still ahead: the external-plugin sandbox and OAuth. See [`Doot-PRD.md`](./Doot-PRD.md) for the full spec.

## Why Doot

The "host screen + crowd phones" format (think Jackbox, Kahoot, Mentimeter) is great, but every option leaves a gap: tiny player caps, per-pack or per-seat pricing, fixed content, laggy remote play, and weak accessibility. Doot is built to be the open answer:

- **No artificial caps.** Big active-player counts and a generous spectator audience, not 8 players and a paywall.
- **Free and self-hostable.** Run it on your laptop or a single $6 droplet. No accounts required to host, join, or play.
- **Games are plugins.** New game *types* are small declarative packages, not forks. Drop one in the repo, or register an external one by URL, no change to the platform.
- **True second screen.** Phones get game state directly over a real-time relay, so there's no screen-share desync. Drop your phone? Rejoin with the same name and pick up where you left off.
- **Built for real rooms.** Convention panels, bar trivia, house parties, and classrooms, high-contrast UI, QR join, host pacing controls, and accessibility from day one.

A deeper analysis of the landscape and user needs lives in [PRD §2](./Doot-PRD.md).

## How it works

```
        ┌──────────────────────┐
        │   Host (big screen)   │  ← lobby · gameplay · animated results
        └───────────┬──────────┘
                    │  pub/sub (phase, rounds, tallies)
        ┌───────────▼──────────┐
        │   CLASP relay        │  ← all live, ephemeral state (TTL'd)
        │  wss://relay.clasp.to│
        └───────────┬──────────┘
                    │  each phone owns its own inputs
   ┌──────────┬─────┴─────┬──────────┐
   │ Player 1 │ Player 2  │  Player N │  ← join by code / QR, no app install
   └──────────┴───────────┴──────────┘

   SQLite/libSQL ← durable only: accounts, saved game definitions
   (never touched during live play)
```

Two kinds of state, kept strictly apart: **ephemeral** live state lives on the relay; **durable** state (accounts, saved games) lives in a SQLite/libSQL store (Postgres is a documented follow-up for multi-instance scale). The app server holds no session state, so it scales out without coordination.

## Features

- 🎮 **Seven built-in games**, Guess, Rate, Poll, Rank, Draw, the VoteBox composite, and Custom (mix any blocks); more on the roadmap.
- 🧩 **Blocks + compositions**, a *block* is a round kind (content schema + Player/Host views + aggregate + answer-withholding); a *game* composes blocks. Most games are ~20 lines and need no components. Import a whole game from a [markdown spec](./docs/markdown-games.md).
- 🎨 **Theming**, cute, cyber, professional, and playful packs out of the box; per-game accent and title overrides.
- ♻️ **Reconnect by name**, no login, no local-storage dependency.
- 🕓 **Host pacing**, open, lock, reveal, advance; optional per-round timers with auto-lock.
- 🖼️ **Media**, persistent uploads to S3-compatible storage; ephemeral drawings/photos on the relay with TTL.
- 📊 **Animated results**, leaderboards, podiums, award cards, bar races, confetti, worth watching.
- ♿ **Accessibility baseline**, semantic markup, color + shape, reduced-motion support, high contrast, untimed modes.

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | **Nuxt** (Nuxt 4 line) + **Vue 3**, TypeScript strict |
| Real-time | **CLASP** (`@clasp-to/core`) pub/sub relay |
| Canvas / heavy animation | **Pixi 8** via **[`vue3-pixi`](https://github.com/hairyf/vue3-pixi)**, *CSS first, Pixi only where it earns its place* |
| Database | **Drizzle ORM** over **libSQL/SQLite** (zero-config; Postgres is a follow-up for scale) |
| Auth | **better-auth** + argon2id (optional, non-blocking) |
| Validation | **Zod** (API, manifests, game configs) |
| Object storage | **DigitalOcean Spaces** / **MinIO** (S3) via `aws4fetch` presigning |
| Infra | **Docker Compose** + **Caddy** (automatic HTTPS) |
| Tooling | **pnpm** workspaces, **Biome**, **Vitest** |

> **Animation philosophy:** plain CSS is the default for motion, it's lighter, accessible by default, and renders identically everywhere. Pixi (through `vue3-pixi`) is reserved for the drawing surface, mini-games, and particle-heavy results moments. See [PRD §6](./Doot-PRD.md) and [`CLAUDE.md`](./CLAUDE.md).

## Try the prototype

You can play with the original single-file VoteBox prototype today, it talks to the public CLASP relay and needs no build step. Because phones must reach it over the network, serve it over HTTP(S) rather than opening the file directly:

```bash
# from the repo root
npx serve .
# then open the printed URL, e.g. http://localhost:3000/votebox%20(1).html
```

Click **Host a game** on one screen, then **Join with a room code** on your phone (same Wi-Fi or any network). This prototype is what the `@doot-games/engine` and the VoteBox plugin generalize.

## Quickstart (full app)

```bash
# 1. Clone and install
git clone https://github.com/virgilvox/doot-games.git
cd doot-games
pnpm install

# 2. Run the dev server (talks to the public CLASP relay; no DB needed to host/play)
pnpm dev                    # http://localhost:3000

# 3. Verify the workspace
pnpm test                   # 82 tests (engine, scoring, themes, markdown, schema-form); +1 opt-in live relay test
pnpm -r typecheck

#, or, bring up the full local stack (app + Postgres + MinIO)
cp .env.example .env
docker compose -f docker/docker-compose.yml up --build
```

Open the app, pick a game type to **host**, put it on the big screen, and share the code/QR. On a phone, open `/play/<CODE>` (or use the join box) to play along.

## Usage

### Hosting a game
1. Open Doot on the screen everyone can see (TV, projector, shared monitor).
2. Pick a game and click **Host**. A 4-character room code and QR appear.
3. Players join; you'll see them populate the lobby.
4. Start the game. Use the control bar to **open voting**, **lock**, **reveal**, and **advance** at your own pace. Rounds can carry a timer that auto-locks.
5. At the end, the animated results play on the big screen and a compact version on each phone.

### Joining as a player
1. Scan the QR or go to the URL and enter the **room code**.
2. Pick a **name**, that's your identity. If your phone drops, re-enter the same name in the same room to reclaim your inputs and score.
3. Answer on your phone when voting is open. Watch the big screen for reveals.

### Creating / editing a game
Signed-in users can create and save games. The editor either uses a plugin's custom editor or auto-generates a form from its Zod config schema (option lists, rating scales, category management, image uploads with preview). Games can be **private**, **unlisted**, or **public**.

## Authoring a game (blocks + compositions)

Games are built from **blocks**. A *block* is a standalone round kind (Guess, Rate, Poll, Rank, Draw) that declares a Zod content schema, a Player view, a Host view, an `aggregate` (pure, testable scoring), and optional answer-withholding. A *game* is a **composition**: a manifest plus an ordered list of `{ block, content }`. The generic renderer mounts the right block per round and merges their results, so most games are ~20 lines and need no components.

```ts
// Compose existing blocks into a new game (no per-game code):
export const myGame = defineGame({
  manifest: { id: 'my-game', name: 'My Game', version: '0.1.0', author: 'you', capabilities: ['timer'] },
  blocks: [guessBlock, rateBlock],
  defaultConfig: { title: 'My Game', rounds: [ /* { block, content } … */ ] },
})
```

Four ways to author, easy → powerful: **(1)** compose existing blocks; **(2)** write a new block (a new round kind); **(3)** ship a curated composition; **(4)** override `components` for a fully custom game. The engine handles rooms, roster, phases, the round state machine, late joiners, reconnects, timers, answer-withholding, and ephemeral media, you don't reimplement any of it. **VoteBox = `[guess, rate]`** is the worked reference, and `Custom` allows any block mix. First-party games live in `packages/games`. Full guide: [`docs/authoring-a-game.md`](./docs/authoring-a-game.md); to generate a game with an LLM, see [`docs/markdown-games.md`](./docs/markdown-games.md).

## Developing

```bash
pnpm install            # install workspace deps
pnpm dev                # run the Nuxt shell against local services
pnpm build              # build all packages + the app
pnpm test               # Vitest (engine state machine + scoring)
pnpm lint               # Biome lint
pnpm format             # Biome format
```

### Repository layout

```
doot-games/
  apps/web/                  # Nuxt shell: discovery, lobby, host, player, editor, API
  packages/
    engine/                  # @doot-games/engine, CLASP wrapper, room runtime, composables
    sdk/                     # @doot-games/sdk   , plugin contract, schemas, round primitives, bridge
    ui/                      # @doot-games/ui    , shared theme-aware Vue components
    themes/                  # @doot-games/themes, token packs + registry
    games/                   # @doot-games/games , blocks + games (Guess/Rate/Poll/Rank/Draw/VoteBox/Custom)
  docker/                    # Dockerfile + compose (local & prod) + Caddyfile
  docs/                      # architecture · authoring-a-game · clasp-primer · deploy
  Doot-PRD.md                # the build spec (source of truth)
  CLAUDE.md                  # rules for AI agents working in this repo
```

**Architecture rules** (don't break these, see [`CLAUDE.md`](./CLAUDE.md)): the engine never imports a game; the sdk never imports the shell; nothing about a live room is written to the database during play; answer keys are withheld from the published config and revealed per round.

## Deployment

### Local (Docker Compose)
`docker/docker-compose.yml` brings up the app, Postgres (named volume), and MinIO (S3 stand-in). Migrations run on startup. One command, no cloud account:

```bash
docker compose -f docker/docker-compose.yml up
```

### Single droplet (production) - git-push deploy
The live site deploys by **pushing to `main`**: `.github/workflows/deploy.yml` runs tests + typecheck, builds `docker/Dockerfile`, pushes the image to GHCR, then SSHes to the droplet and runs `docker compose -f docker/docker-compose.deploy.yml pull && up -d`. The droplet runs the prebuilt image behind **Caddy** (automatic HTTPS); durable state is a **SQLite file** on a host bind-mount (`./data`) that persists across deploys, and startup migrations are idempotent. Object storage is DigitalOcean Spaces (served via its CDN edge); the relay is the public `wss://relay.clasp.to`. Secrets live in `/opt/doot/.env`, never in git. Full guide: `docs/deploy.md`.

> `docker/docker-compose.prod.yml` (Postgres, build-on-host) is an aspirational variant, not the path CI uses. Postgres isn't wired in code yet (a `postgres://` URL falls back to SQLite); don't schedule `pg_dump` against the SQLite deploy.

### Scaling later
Front-loaded by the architecture: swap `DATABASE_URL` to managed Postgres; run several stateless app containers behind a load balancer (no session affinity needed, live state is on the relay); Spaces scales on its own; stand up a self-hosted relay with longer room codes if the public relay becomes a limit.

## Configuration

All configuration is environment-driven; the same image runs anywhere. Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (or a SQLite file path in minimal mode) |
| `SESSION_PASSWORD` | secret for sealing session cookies |
| `SPACES_ENDPOINT` / `SPACES_REGION` / `SPACES_BUCKET` / `SPACES_KEY` / `SPACES_SECRET` | object storage (MinIO locally, Spaces in cloud) |
| `PUBLIC_BASE_URL` | site origin, used for join links and QR codes |
| `CLASP_RELAY_URL` | defaults to `wss://relay.clasp.to` |
| `SMTP_*` | optional, only for magic-link sign-in |

`.env` and any local credentials are gitignored; never commit secrets.

## Roadmap

- **Phase 1 (MVP, shipped):** engine + room runtime, the block contract, the first-party games, the schema-driven editor + markdown import, optional auth + saved games, five theme packs, animated results, presigned uploads, and git-push deploy to a single droplet.
- **Phase 2:** external plugins (sandboxed iframe + bridge + publishing), more games (Quip, Pulse, Rank, Buzz), richer results.
- **Phase 3:** managed Postgres + multiple instances, optional self-hosted relay, accessibility & phone polish.

See [PRD §23](./Doot-PRD.md) for detail.

## Contributing

Contributions are very welcome, especially new game-type plugins, theme packs, accessibility improvements, and docs.

1. **Read [`Doot-PRD.md`](./Doot-PRD.md) and [`CLAUDE.md`](./CLAUDE.md).** They are the source of truth for architecture and conventions.
2. **Fork and branch.** Branch off `main`; keep changes focused.
3. **Match the conventions:** TypeScript strict, validate external input with Zod, keep dependencies small, document as you build (each package has a README), and respect the dependency direction.
4. **Test the logic that matters**, engine state machine and scoring functions with Vitest.
5. **Honor the accessibility baseline** (PRD §2.5): color + shape, `prefers-reduced-motion`, high contrast, untimed options, semantic HTML/ARIA.
6. **Commit messages are plain** and contain **no AI attribution** (no "generated with" lines, no co-author trailers, no tool credits).
7. **Open a PR** describing the change and how you verified it.

New game? Compose blocks (see [authoring a game](#authoring-a-game-blocks--compositions)) in `packages/games`. New round kind? Write one block.

## License

[MIT](./LICENSE) © the Doot contributors.

## Acknowledgements

Built on the [CLASP](https://github.com/lumencanvas/clasp) real-time relay. Pixi rendering via [`vue3-pixi`](https://github.com/hairyf/vue3-pixi) and [Pixi.js](https://pixijs.com). Inspired by the party-game lineage, Jackbox, Kahoot, Gartic Phone, and the open-source clones that proved the demand.
