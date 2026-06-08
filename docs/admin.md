# Admin console

A small, auth-gated operations surface at `/admin` for the people who run a Doot
instance. It is read-mostly metrics plus a handful of moderation actions. It never
touches live room state (that lives on the relay); it only reads and edits the durable
store (accounts, game definitions, decks) and a few historical counters.

## Who is an admin

Two sources (`apps/web/server/utils/admin.ts`):

1. **The first account ever created** is auto-promoted to `role='admin'`, exactly once,
   forever. This is the primary mechanism: stand up Doot, make the first account, and
   it's the admin. See "First-admin bootstrap" below.
2. **`DOOT_ADMIN_EMAILS`** - an optional comma-separated env allowlist override. It
   always grants admin to those emails (with no DB write, so the owner can't be locked
   out, and is immune to bans), and it tells the bootstrap WHICH account to promote when
   more than one already exists (precise operator control).

Promotions after that are made from the console (stored as `user.role='admin'`).

Every `/api/admin/*` route calls `requireAdmin(event)` (401 signed-out, 403 not-admin).
The `/admin` page and the nav link only reflect `/api/admin/me`; they are cosmetic and
never grant access. Authorization is enforced on the server, always.

## First-admin bootstrap

`ensureFirstAdmin` (in `server/utils/admin-repo.ts`) runs at startup (end of the
`auth-migrate` plugin) and after every sign-up, and promotes the first account to admin
**exactly once ever**, guarded by a durable marker in the `app_meta` table:

- If the marker is set -> do nothing (already bootstrapped).
- Else if any account is already an admin -> just set the marker; never auto-promote.
- Else promote a target and set the marker: the earliest account whose email is in
  `DOOT_ADMIN_EMAILS` if set, otherwise the single earliest-created account.
- If there are no accounts yet -> do nothing (the next sign-up gets the chance).

Because the marker persists, it never fires twice, even if that admin is later demoted
or deleted. To be precise about which account on an existing deployment, set
`DOOT_ADMIN_EMAILS` before the first boot of this code.

### Manual override (`set-admin.mjs`)

```bash
node scripts/set-admin.mjs you@example.com yourpassword   # create (if missing) + promote
node scripts/set-admin.mjs you@example.com                # promote an existing account
```

Writes to the DB at `DATABASE_URL` (defaults to the local `apps/web/.data/doot.sqlite`);
point it at production's DB to promote there. New accounts are created through better-auth
so the password uses the same argon2id hashing the app verifies against.

### Local development

The same first-account rule applies in dev: with a fresh DB (`rm -rf apps/web/.data`),
the first account you sign up becomes admin. The committed dev database ships a generic
admin `admin@doot.test` (password `dootadmin`) so you can open `/admin` immediately;
it's local-only and never exists in production.

## What the console shows

- **Overview** - users (total, new this week/month, with-handle, admins, suspended),
  games (total, published/unlisted/private, featured, total plays, new this week),
  decks, bookmarks, games-by-type, and the most-played games.
- **Users** - every account with its game/deck/play totals; promote/demote admin;
  suspend/unsuspend (with a reason shown to the user). Search by email/name/@handle.
- **Games** - every game regardless of visibility, with its owner and play count.
  Override visibility (take a game down to private), toggle the **Feature** flag, or
  delete. Sort by plays or recency; filter by visibility; search.
- **Decks** - every deck with its owner; override visibility or delete.

## Play counts

`games.play_count` and `games.last_played_at` are durable historical stats (allowed by
PRD §1), not live room state. The host pings `POST /api/games/[id]/play` once when a
saved game's room actually starts (leaves the lobby), best-effort and fire-and-forget;
templates and abandoned lobbies don't count. The per-IP write rate limit bounds abuse.

## Featuring games

The **Feature** toggle in the Games tab spotlights a creator's game. Featuring sets
`games.featured`, and `listPublicGames` orders featured games first (then newest), so a
featured public game leads the public listing (`/api/games`) and shows first in the
homepage **"Fresh from creators"** rail with a "Featured" badge. Featuring a private or
unlisted game is harmless: it only surfaces once the game is public/listed.

## Moderation: bans

Suspending a user sets `user.banned = 1` (+ reason). `server/middleware/ban-guard.ts`
then blocks that account from the entire content-write surface (`/api/games`,
`/api/decks`, `/api/uploads` writes) with a 403 that surfaces the reason. Anonymous
hosting/playing need no account, so they are out of scope by design; moderation targets
saved content and accounts.
