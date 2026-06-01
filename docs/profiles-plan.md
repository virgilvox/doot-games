# Plan: user profiles + profile editor (C11), with bookmarks (C12) as a follow-on

Status: **planned, not built.** Pairs with `HANDOFF.md` and `docs/BACKLOG.md` (C11/C12).
Goal: let a creator have a public identity (display name, avatar, short bio) and a
page that shows their public games, plus an editor to set those. This also closes
the C10 gap where the public author byline shows the email local-part (the signup
default for `user.name`), because users can finally set a real display name.

## What already exists (so we build on it, not around it)

- **Auth**: better-auth `^1.6.12` over libSQL. Its `user` table already has `id`,
  `name` (display name), `email`, `image` (avatar URL), `createdAt`, `updatedAt`.
  Migrations run at startup via `getMigrations(authOptions)` + `runMigrations()`
  (`server/plugins/auth-migrate.ts`), idempotent — **adding an `additionalFields`
  column to `authOptions` auto-creates it** at next boot.
- **Editing the user**: better-auth's client exposes `authClient.updateUser({ name,
  image, ...additionalFields })` (same-origin, session-gated). No custom write
  endpoint needed for name/avatar/bio.
- **Avatar upload**: reuse `useImageUpload()` + the `/api/uploads/config` gate +
  `IMAGE_UPLOAD` provide/inject (exactly how `GameEditor` does cover images). It
  degrades to URL-paste when storage isn't configured or the user is logged out.
- **Public name lookup**: `server/utils/users.ts` already batch-resolves display
  names (never email). We extend it for full public profiles.
- **Game listing**: `games-repo.ts` has `listPublicGames()` and `listMyGames()`;
  the summary already carries `authorName`. We add a public-games-by-owner query.
- **Author byline (C10)**: `/g/<id>`, Explore, and Home rails already render
  "by <name>" — we make that a link to the profile.

## Decisions (recommended)

1. **Profile URL: `/u/<userId>` for v1**, not a hand-picked handle. The user id is
   opaque and unique; no claim/collision flow. A pretty `@handle` (a unique
   `username` additionalField + a claim step) is a clean **phase-2** if we want it;
   it doesn't change the page or data model, only the route param + a lookup.
2. **Bio** is a new better-auth `additionalField` (`bio`, string, optional, ≤280).
   Auto-migrates. Validated on write.
3. **Editing uses `authClient.updateUser`** directly from the editor page (no new
   write route). Public reads go through a new read endpoint that never leaks email.
4. **C12 bookmarks is a separate phase** (own table + endpoints + a Save button).
   Plan it here but ship C11 first.

## Phase 1 — C11 profiles + editor

### Data
- Add to `authOptions` (`server/utils/auth.ts`):
  ```ts
  user: { additionalFields: { bio: { type: 'string', required: false, input: true } } }
  ```
  Verify at boot that the `bio` column is added (libSQL). If better-auth's migration
  doesn't add it, fall back to an additive `ALTER TABLE user ADD COLUMN bio TEXT` in a
  startup hook (mirror the games-table pattern in `db.ts`).

### Server
- `server/utils/users.ts`: add `getPublicProfile(id)` → `{ id, name, image, bio }`
  (read `name, image, bio` from the `user` table; **never** `email`; null if missing).
- `server/utils/games-repo.ts`: add `listPublicGamesByOwner(ownerId)` (mirror
  `listPublicGames` + `eq(games.ownerId, ownerId)`), returning the existing summary.
- `server/api/users/[id].get.ts` (public): returns `{ profile, games }` where
  `games` is that owner's public summaries. 404 if the user has no public presence
  (no account / nothing public) so we don't confirm account existence needlessly.
  Rate-limited by the existing middleware.

### Client
- `app/pages/u/[id].vue` (public profile): avatar (fallback to a generated initial
  monogram when `image` is empty — reuse the `GameCover` initial style), display
  name, bio, and a grid of their public games (reuse the Explore community-card
  markup + `GameCover`). Empty state when they have no public games yet. SSR-friendly
  (`useFetch`).
- `app/pages/account.vue` (or `/settings`, owner-only; redirect to `/login` if not
  signed in): a form to edit **display name**, **avatar** (upload via the existing
  uploader, else URL paste, else a monogram), and **bio** (textarea, ≤280, live
  count). Submits via `authClient.updateUser(...)`. Optimistic + error toast. A
  "View my public profile" link to `/u/<myId>`.
- **Wire C10 → C11**: make the "by <name>" byline on `/g/<id>`, Explore, and Home
  link to `/u/<ownerId>`. (Explore/Home summaries don't expose `ownerId` today —
  add `ownerId` to the public summary, or resolve the link server-side. Smallest:
  include `ownerId` on the summary since the detail endpoint already returns it.)
- Add an "Account" / "Profile" entry to the top-right nav when signed in (near the
  existing auth controls), and a nudge to set a display name if it still equals the
  email local-part.

### Copy / a11y / rules
- No emoji (use `Icon`); no em dashes; short, line-clamped bio on the public page.
- Avatar `<img>` has alt = display name; monogram fallback is `aria-hidden` with an
  adjacent visible name. Honor broken-image fallback (hide → monogram).
- Validation (Zod where there's a server boundary): `name` 1–40 trimmed; `bio` ≤280
  trimmed; `image` URL ≤2000. The display name is the only public identifier — never
  render the email anywhere.

### Tests / verify
- Unit: `getPublicProfile` redaction (no email field present), `listPublicGamesByOwner`
  (only public, only that owner). A server-route test isn't in the suite today; verify
  the endpoint with a temp row like the C10 check (insert a public game + a user, curl
  `/api/users/<id>`).
- Real browser: sign in → set name/avatar/bio → view `/u/<id>` → see the public games;
  byline on `/g/<id>` links to the profile. Screenshot at 390px + 1440px, 0 overflow.
- `pnpm test && pnpm -r typecheck && pnpm --filter @doot-games/web build`.

### Effort
~Medium. Riskiest bit is confirming the better-auth `bio` additionalField migrates
on the libSQL adapter — verify first; the manual-ALTER fallback is cheap.

## Phase 2 — C12 bookmarks (separate ship)
- Table `bookmarks(user_id, game_id, created_at)` in `db.ts` (PK `(user_id, game_id)`),
  additive-migrated like `games`.
- `games-repo`: `addBookmark/removeBookmark/listBookmarkedGames(userId)`.
- API: `POST/DELETE /api/games/:id/bookmark` (session-gated, idempotent);
  `GET /api/games?scope=saved`. Respect visibility (a bookmarked game that later
  goes private reads as not-found for non-owners).
- UI: a "Save" toggle on `/g/<id>` and on cards (logged-in only; logged-out → login
  CTA). A "Saved" rail on `/mine` (and/or the profile's own view).

## Phase 3 — optional polish (defer)
- `@handle` vanity URLs (unique `username` additionalField + claim + `/u/@handle`).
- Profile theme accent; "creator since"; public game counts/plays (needs stats, not
  built — durable-stats is out of scope per the relay-only rule for live state).

## Out of scope / guardrails
- No following/social graph, no DMs, no public activity feed (not a social network).
- Live/room state stays on the relay; profiles are durable account data only.
- Email is never exposed by any profile surface.
