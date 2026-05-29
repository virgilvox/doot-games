# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-05-29. Branch: `build/mvp-scaffold`._

## What exists and is verified

A pnpm monorepo built from the PRD. **56 tests pass, all library packages typecheck, and the Nuxt app builds (SSR).**

| Package | State |
| --- | --- |
| `@doot-games/engine` | Done + tested (40). Room runtime, phase/round state machine, reconnect-by-name identity, late-joiner eligibility, CLASP wrapper, answer withholding, `useDootRoom`. |
| `@doot-games/sdk` | Done. Plugin contract, 7 round primitives, Zod manifest, scoring + results types. |
| `@doot-games/themes` | Done + tested (7). Five token packs (doot/cutesie/cyber/professional/playful), CSS generation, base stylesheet. |
| `@doot-games/ui` | Done. 18 theme-aware components + the ported design-system stylesheet. |
| `@doot-games/games` | Done + tested (9). Guess + Rate (single-type) and VoteBox (composite), shared deck engine. |
| `apps/web` | Builds. Home/explore/create + client-only host/play wired to the engine over the live relay. |

## How to run

```bash
pnpm install
pnpm dev          # http://localhost:3000  (uses the public relay; no DB needed)
pnpm test         # 56 tests
pnpm -r typecheck
pnpm --filter @doot-games/web build
```

To exercise a game: open `/`, host a type (e.g. `/host/votebox`) on one screen, open `/play/<CODE>` on another.

## Key decisions

- **Game types are the round primitives.** Single-type plugins (Guess, Rate) lead; VoteBox is the Guess+Rate composite. Draw/Poll/Rank/Buzz map to existing SDK primitives and are not built yet.
- **CSS-first animation**; `vue3-pixi` is installed and reserved for canvas-heavy work (DrawCanvas, mini-games). ConfettiBurst is CSS.
- **Answer withholding**: the host keeps the full config locally and publishes a redacted one; answers are revealed per round. Players/spectators never receive answer keys.
- **The design system** is `doot-mockup.html`, ported to `@doot-games/themes` + `@doot-games/ui`, improved with an accessibility baseline.
- Commit messages contain **no AI attribution** (project rule).

## Not built yet (PRD phase one and beyond)

1. **Remaining game types**: Draw, Poll, Rank, Buzz, Quip (primitives exist in the SDK).
2. **Persistence**: Postgres + Drizzle schema, the `/api/games` routes, saved games.
3. **Auth**: `nuxt-auth-utils` email/password, optional and non-blocking.
4. **The editor**: schema-driven form from a plugin's Zod config (auto-generated), plus VoteBox's custom editor.
5. **Uploads**: presigned PUT to Spaces/MinIO.
6. **External plugins**: the sandboxed iframe runtime + postMessage bridge + publishing flow (PRD §9).
7. **Per-game theme on the play surface** (see below).
8. **A live browser playtest** has not been run here (needs the relay + two devices).

## Known gaps / things to check first

- The play/host surface currently renders in the **theme chosen in the top bar**, not the game's configured `meta.themeId`. Wiring `ThemeProvider` to the room meta on those routes is a small follow-up.
- `apps/web` typecheck via `nuxi typecheck` is heavier than the library `tsc` checks; the production build is the fast signal that everything integrates.
- Per-package READMEs are not written yet (PRD §22 asks for them).

## Suggested next step

Pick up persistence + auth (so games can be saved and stats tracked) or finish the remaining game types — both are well-scoped against the existing SDK and engine. Run the deep-audit findings (if any) to ground first.
