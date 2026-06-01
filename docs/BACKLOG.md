# Backlog — remaining work

The running tracker of what is **not yet built**, verified against the code on
2026-06-01 (after D13b Circuit Cypher shipped). Pair with `HANDOFF.md` (current
state) and `docs/flagship-games.md` (designs). Items are roughly ordered within
each group; `[size]` is a rough effort hint.

## Done (for context, do not redo)
- Consumer bugs A1–A5, author features B6–B9.
- 12 games incl. 5 flagships; the catalog IA; saved games + optional auth + uploads.
- **D13 Circuit Cypher** — full 3D animated rap-battle tournament (custom flow), MC
  voice, per-player verses, live-perform mode, co-host driving. Deployed. (Polish
  follow-ups tracked under "Circuit Cypher polish" below.)

---

## C. Social / discovery  (none built)
- [ ] **C10. Publisher / author name** on community games + the `/g/<id>` detail page
  (show the author's display name, never the email). `[small]` — confirmed: no
  author/publisher display in `apps/web/app/pages/g/`.
- [ ] **C11. User profile pages** + a profile editor (display name, avatar, bio); the
  profile lists that user's public games. `[medium]` — no `/u` pages exist.
- [ ] **C12. Bookmark / save games** so a logged-in user can find them again. `[small-medium]`

## D. Flagship depth / more content
- [ ] **D14. The full "What, You Didn't Know That?" gameshow** (`docs/flagship-games.md`
  §9) — the big remaining flagship-depth item, analogous to what D13 did for Circuit
  Cypher: the **4-contestant panel + audience steal** (custom components; first audience
  member to buzz in correct takes the lowest contestant's seat + points), a **quick-draw
  tiebreaker** (reuse `draw`), a **final lightning round**, and the **specialty content
  packs** (actor photos via option images, poorly-described plots, a **theme-song
  audio-clip block**, macguffins, misheard lyrics, Six Degrees of Kevin Bacon…). `[large]`
- [ ] **Fib Finder** (Fibbage) — `quip` → `vote` (field) + an injected truth + dual-axis
  scoring (find the truth / fool others). Nearly free now that `vote` exists. `[small]`
- [ ] **Sketch & Spot** (Drawful) — the existing `draw` block → `vote` (field). Pure
  reuse; proves the Draw block in the two-phase loop. `[small]`
- [ ] **The Big Reveal** (Talking Points) — the stretch capstone: a presenter improvises
  over slides an Assistant feeds live; the crowd taps up/down. Needs a continuous
  reaction/feed channel — now more feasible since `publishExtra`/`onExtra` + the
  `/x/drive` pattern exist. `[large]`

### Circuit Cypher polish (D13 follow-ups)
- [ ] Real **two-phone, on-device** playtest (touch + device WebGL/audio/TTS). `[testing]`
- [ ] Optional **themed arena colors** (currently the deliberate neon cyan/magenta battle
  palette; could derive from theme accents). `[small]`

## E. Roadmap
- [ ] **E16. Robustness** (`docs/flagship-games.md` §6) — none wired:
  - untimed **"advance when everyone has submitted"** host toggle (only per-round
    timer-off exists in the editor today);
  - **timeout safety net**: auto-fill an unsubmitted free-text round at 50% (no dead air);
  - **content-filter tiers** (off / moderate / strict) + family/adult prompt tracks;
  - **audience-as-discounted-bloc** voting (`audienceWeight` exists in `scoring.ts` but is
    not wired into any game);
  - tie handling (split / co-crown) + custom prompt packs via a share code.
- [ ] **E18. Smaller engine gaps:**
  - `PlayerReveal` is only on **guess / vote / buzzer / split** — add to **poll / rank /
    rate / draw** so phones get personal reveal feedback everywhere;
  - own-answer hiding does not fire for **fill / split** votes (wire the reserved
    `assignment` / `promptFor` per-player path, currently unused by the renderer);
  - **admin role** + DB-backed official games + versioning.
- [ ] **E15. External-plugin runtime** — sandboxed iframe on a separate `plugins.doot.games`
  origin + a typed postMessage bridge + manifest-by-URL with a SHA pin. Security-critical;
  designed in `docs/external-plugins.md`. `[large]`
- [ ] **E17. Infra:** OAuth / magic-link (better-auth config); **Postgres** for
  multi-instance scale (driver behind `useDb()`); **upload hardening** (presigned-POST
  size policy + content-type enforcement).

## Misc / docs / known trades
- [ ] PRD §8 still documents the pre-block plugin contract — reconcile with the block model.
- [ ] **Rank** `emptyInput` seeds the authored order (documented consensus-drift trade);
  revisit with a per-player shuffle or a "must reorder" gate.
- [ ] Docker base image not digest-pinned; rate-limiting is per-instance (move to a shared
  store before running multiple app containers).
- [ ] The dead per-round answer publish (a harmless write-only relay channel).
