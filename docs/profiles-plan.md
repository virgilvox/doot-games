# Plan: user profiles + profile editor (C11), with bookmarks (C12) as a follow-on

Status: **planned, not built - on hold pending go-ahead.** Decisions locked
(2026-06-01): use **@handle vanity URLs** (not bare `/u/<id>`); the user opted to
keep this plan for review rather than build yet. Pairs with `HANDOFF.md` and
`docs/BACKLOG.md` (C11/C12).
Goal: let a creator have a public identity (display name, avatar, short bio) and a
page that shows their public games, plus an editor to set those. This also closes
the C10 gap where the public author byline shows the email local-part (the signup
default for `user.name`), because users can finally set a real display name.

## What already exists (so we build on it, not around it)

- **Auth**: better-auth `^1.6.12` over libSQL. Its `user` table already has `id`,
  `name` (display name), `email`, `image` (avatar URL), `createdAt`, `updatedAt`.
  Migrations run at startup via `getMigrations(authOptions)` + `runMigrations()`
  (`server/plugins/auth-migrate.ts`), idempotent - **adding an `additionalFields`
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
  "by <name>" - we make that a link to the profile.

## Decisions (locked)

1. **Profile URL: `@handle` vanity URLs** - `/u/@jane`. Each account claims a unique
   handle; the profile and shareable link use it. Implications: a unique handle field,
   a claim/validation step, reserved-name guarding, and a backfill path for existing
   accounts (no handle yet → no public profile link until claimed). **Strongly prefer
   better-auth's official `username` plugin** (adds `username` + `displayUsername`,
   uniqueness, validation, and optional sign-in-by-username) over a hand-rolled field.
2. **Bio** is a new better-auth `additionalField` (`bio`, string, optional, ≤280).
   Auto-migrates. Validated on write.
3. **Editing uses `authClient.updateUser`** (and the username plugin's set-username
   call) from the editor page - no new write route. Public reads go through a new
   read endpoint that never leaks email.
4. **C12 bookmarks is a separate phase** (own table + endpoints + a Save button).
   Plan it here but ship C11 first.

## Phase 1 - C11 profiles + editor

### Data
- **Handles**: add better-auth's `username` plugin (server `plugins: [username()]`
  in `authOptions`, client `usernameClient()` in `auth-client.ts`). It adds
  `username` (normalized, unique) + `displayUsername` to the `user` table and a
  `setUsername`/`isUsernameAvailable` client API. Confirm its migration runs via the
  existing startup `runMigrations` path. Reserve route-colliding handles
  (`account`, `login`, `explore`, `create`, `host`, `play`, `g`, `u`, `mine`,
  `support`, `api`) in validation.
- Add to `authOptions` (`server/utils/auth.ts`):
  ```ts
  user: { additionalFields: { bio: { type: 'string', required: false, input: true } } }
  ```
  Verify at boot that the `bio` column is added (libSQL). If better-auth's migration
  doesn't add it, fall back to an additive `ALTER TABLE user ADD COLUMN bio TEXT` in a
  startup hook (mirror the games-table pattern in `db.ts`).
- **Backfill**: existing accounts have no handle. Don't auto-assign; on first visit
  to `/account`, suggest one from the display name (slugified, de-duped) and let them
  claim it. A profile is only public/linkable once a handle is set.

### Server
- `server/utils/users.ts`: add `getPublicProfileByHandle(handle)` →
  `{ id, name, handle, image, bio }` (look up by `username`; **never** `email`; null
  if no such handle). Also extend the existing name resolver to return the author's
  `handle` alongside `name` (so bylines can link), e.g. `authorsFor(ids)` →
  `Map<id,{name,handle}>`.
- `server/utils/games-repo.ts`: add `listPublicGamesByOwner(ownerId)` (mirror
  `listPublicGames` + `eq(games.ownerId, ownerId)`), returning the existing summary;
  include the author `handle` on public summaries so cards can link to the profile.
- `server/api/users/[handle].get.ts` (public): resolve `@handle` (strip a leading
  `@`), returns `{ profile, games }` where `games` is that owner's public summaries.
  404 for an unknown/unclaimed handle so we don't confirm account existence.
  Rate-limited by the existing middleware.

### Client
- `app/pages/u/[handle].vue` (public profile): the route param is the `@handle`
  (strip the `@` for lookup). Avatar (fallback to a generated initial monogram when
  `image` is empty - reuse the `GameCover` initial style), display name, `@handle`,
  bio, and a grid of their public games (reuse the Explore community-card markup +
  `GameCover`). Empty state when they have no public games yet. SSR-friendly
  (`useFetch`); 404 page for an unknown handle.
- `app/pages/account.vue` (owner-only; redirect to `/login` if not signed in): edit
  **display name**, **@handle** (claim/change - live availability check via the
  username plugin's `isUsernameAvailable`, slug rules + reserved-name guard, inline
  error), **avatar** (upload via the existing uploader, else URL paste, else a
  monogram), and **bio** (textarea, ≤280, live count). Submits via
  `authClient.updateUser(...)` + `setUsername(...)`. Optimistic + error toast. A
  "View my public profile" link to `/u/@<handle>` (shown once a handle is claimed).
- **Wire C10 → C11**: make the "by <name>" byline on `/g/<id>`, Explore, and Home
  link to `/u/@<handle>` - but only when the author has claimed a handle (else render
  plain text). Requires the author `handle` on the public game summary/detail (add it
  via the extended `authorsFor` resolver above).
- Add an "Account" / "Profile" entry to the top-right nav when signed in (near the
  existing auth controls), and a nudge to claim a handle / set a display name if the
  display name still equals the email local-part.

### Copy / a11y / rules
- No emoji (use `Icon`); no em dashes; short, line-clamped bio on the public page.
- Avatar `<img>` has alt = display name; monogram fallback is `aria-hidden` with an
  adjacent visible name. Honor broken-image fallback (hide → monogram).
- Validation (Zod where there's a server boundary): `name` 1–40 trimmed; `bio` ≤280
  trimmed; `image` URL ≤2000. The display name is the only public identifier - never
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
~Medium+. Two things to de-risk first: (1) the better-auth `username` plugin migrates
cleanly on the libSQL/Kysely adapter and its client API works as documented; (2) the
`bio` additionalField column is added at boot (manual-ALTER fallback is cheap). Do a
throwaway spike on both before building the UI.

## Phase 2 - C12 bookmarks (separate ship)
- Table `bookmarks(user_id, game_id, created_at)` in `db.ts` (PK `(user_id, game_id)`),
  additive-migrated like `games`.
- `games-repo`: `addBookmark/removeBookmark/listBookmarkedGames(userId)`.
- API: `POST/DELETE /api/games/:id/bookmark` (session-gated, idempotent);
  `GET /api/games?scope=saved`. Respect visibility (a bookmarked game that later
  goes private reads as not-found for non-owners).
- UI: a "Save" toggle on `/g/<id>` and on cards (logged-in only; logged-out → login
  CTA). A "Saved" rail on `/mine` (and/or the profile's own view).

## Phase 3 - optional polish (defer)
- Sign-in by handle (the username plugin supports it) as an alternative to email.
- Profile theme accent; "creator since"; public game counts/plays (needs stats, not
  built - durable-stats is out of scope per the relay-only rule for live state).

## Out of scope / guardrails
- No following/social graph, no DMs, no public activity feed (not a social network).
- Live/room state stays on the relay; profiles are durable account data only.
- Email is never exposed by any profile surface.
