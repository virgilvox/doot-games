/**
 * Admin read/write queries: platform metrics, the user/game/deck management lists,
 * and the moderation mutations. Admin-only (callers gate with `requireAdmin`), so
 * these intentionally surface data the public API never would (emails, every game
 * regardless of visibility) and can edit any row regardless of owner.
 *
 * Two date encodings live in this store: better-auth's `user.createdAt` is ISO text,
 * while `games`/`decks` `created_at` is epoch-ms integer. The "new in N days" cutoffs
 * are computed in each form accordingly.
 */
import { eq, sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { adminEmailAllowlist } from './admin-config'
import { type Visibility, appMeta, bookmarks, decks, games, useDb } from './db'

// Writable view of better-auth's `user` table for the moderation columns.
const userTable = sqliteTable('user', {
  id: text('id').primaryKey(),
  role: text('role'),
  banned: integer('banned', { mode: 'boolean' }),
  banReason: text('banReason'),
  bannedAt: integer('bannedAt'),
})

const DAY = 86_400_000

// ── Metrics ────────────────────────────────────────────────────────────────

export interface AdminStats {
  users: { total: number; withHandle: number; admins: number; banned: number; new7d: number; new30d: number }
  games: {
    total: number
    public: number
    unlisted: number
    private: number
    featured: number
    plays: number
    new7d: number
  }
  decks: { total: number; public: number; unlisted: number; private: number; new7d: number }
  bookmarks: number
  /** Open (un-triaged) content reports awaiting a moderator. */
  openReports: number
  /** Games per game-type (pluginId), most first. */
  byType: Array<{ pluginId: string; count: number }>
  /** Most-hosted public/unlisted games. */
  topPlayed: Array<{ id: string; title: string; plays: number; visibility: Visibility }>
}

/** Run a read and coerce a numeric column, tolerating a not-yet-migrated table. */
async function safeRow<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

function n(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0
}

export async function getStats(): Promise<AdminStats> {
  const db = await useDb()
  const now = Date.now()
  const userSince7 = new Date(now - 7 * DAY).toISOString()
  const userSince30 = new Date(now - 30 * DAY).toISOString()
  const gameSince7 = now - 7 * DAY

  const users = await safeRow(
    async () => {
      const r = (await db.get(sql`
        SELECT
          count(*) AS total,
          sum(CASE WHEN username IS NOT NULL AND username <> '' THEN 1 ELSE 0 END) AS withHandle,
          sum(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins,
          sum(CASE WHEN banned = 1 THEN 1 ELSE 0 END) AS banned,
          sum(CASE WHEN createdAt >= ${userSince7} THEN 1 ELSE 0 END) AS new7d,
          sum(CASE WHEN createdAt >= ${userSince30} THEN 1 ELSE 0 END) AS new30d
        FROM user
      `)) as Record<string, unknown>
      return {
        total: n(r.total),
        withHandle: n(r.withHandle),
        admins: n(r.admins),
        banned: n(r.banned),
        new7d: n(r.new7d),
        new30d: n(r.new30d),
      }
    },
    { total: 0, withHandle: 0, admins: 0, banned: 0, new7d: 0, new30d: 0 },
  )

  const gamesRow = await safeRow(
    async () => {
      const r = (await db.get(sql`
        SELECT
          count(*) AS total,
          sum(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END) AS pub,
          sum(CASE WHEN visibility = 'unlisted' THEN 1 ELSE 0 END) AS unl,
          sum(CASE WHEN visibility = 'private' THEN 1 ELSE 0 END) AS priv,
          sum(CASE WHEN featured = 1 THEN 1 ELSE 0 END) AS feat,
          COALESCE(sum(play_count), 0) AS plays,
          sum(CASE WHEN created_at >= ${gameSince7} THEN 1 ELSE 0 END) AS new7d
        FROM games
      `)) as Record<string, unknown>
      return {
        total: n(r.total),
        public: n(r.pub),
        unlisted: n(r.unl),
        private: n(r.priv),
        featured: n(r.feat),
        plays: n(r.plays),
        new7d: n(r.new7d),
      }
    },
    { total: 0, public: 0, unlisted: 0, private: 0, featured: 0, plays: 0, new7d: 0 },
  )

  const decksRow = await safeRow(
    async () => {
      const r = (await db.get(sql`
        SELECT
          count(*) AS total,
          sum(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END) AS pub,
          sum(CASE WHEN visibility = 'unlisted' THEN 1 ELSE 0 END) AS unl,
          sum(CASE WHEN visibility = 'private' THEN 1 ELSE 0 END) AS priv,
          sum(CASE WHEN created_at >= ${gameSince7} THEN 1 ELSE 0 END) AS new7d
        FROM decks
      `)) as Record<string, unknown>
      return {
        total: n(r.total),
        public: n(r.pub),
        unlisted: n(r.unl),
        private: n(r.priv),
        new7d: n(r.new7d),
      }
    },
    { total: 0, public: 0, unlisted: 0, private: 0, new7d: 0 },
  )

  const bookmarkCount = await safeRow(async () => {
    const r = (await db.get(sql`SELECT count(*) AS c FROM bookmarks`)) as Record<string, unknown>
    return n(r.c)
  }, 0)

  const openReports = await safeRow(async () => {
    const r = (await db.get(sql`SELECT count(*) AS c FROM reports WHERE status = 'open'`)) as Record<string, unknown>
    return n(r.c)
  }, 0)

  const byType = await safeRow(async () => {
    const rows = (await db.all(sql`
      SELECT plugin_id AS pluginId, count(*) AS count FROM games GROUP BY plugin_id ORDER BY count DESC
    `)) as Array<Record<string, unknown>>
    return rows.map((r) => ({ pluginId: String(r.pluginId ?? ''), count: n(r.count) }))
  }, [])

  const topPlayed = await safeRow(async () => {
    const rows = (await db.all(sql`
      SELECT id, title, COALESCE(play_count, 0) AS plays, visibility
      FROM games WHERE play_count > 0 ORDER BY play_count DESC LIMIT 10
    `)) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ''),
      plays: n(r.plays),
      visibility: String(r.visibility ?? 'private') as Visibility,
    }))
  }, [])

  return { users, games: gamesRow, decks: decksRow, bookmarks: bookmarkCount, openReports, byType, topPlayed }
}

// ── User management ──────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string
  email: string | null
  name: string | null
  handle: string | null
  image: string | null
  role: string
  banned: boolean
  banReason: string | null
  createdAt: string | null
  gameCount: number
  publicGameCount: number
  deckCount: number
  totalPlays: number
}

/** List accounts with their content + play totals, newest first. Optional `q`
 *  filters by email/name/handle (admin-only, so email search is intentional). */
export async function listUsers(opts: { q?: string; limit?: number } = {}): Promise<AdminUserRow[]> {
  const db = await useDb()
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500)
  const q = opts.q?.trim().toLowerCase()
  const like = q ? `%${q}%` : null
  const where = like
    ? sql`WHERE lower(u.email) LIKE ${like} OR lower(u.name) LIKE ${like} OR lower(u.username) LIKE ${like}`
    : sql``
  const rows = (await db.all(sql`
    SELECT
      u.id, u.email, u.name, u.username AS handle, u.image, u.role, u.banned, u.banReason, u.createdAt,
      (SELECT count(*) FROM games g WHERE g.owner_id = u.id) AS gameCount,
      (SELECT count(*) FROM games g WHERE g.owner_id = u.id AND g.visibility = 'public') AS publicGameCount,
      (SELECT count(*) FROM decks d WHERE d.owner_id = u.id) AS deckCount,
      (SELECT COALESCE(sum(g.play_count), 0) FROM games g WHERE g.owner_id = u.id) AS totalPlays
    FROM user u
    ${where}
    ORDER BY u.createdAt DESC
    LIMIT ${limit}
  `)) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    email: (r.email as string) ?? null,
    name: ((r.name as string) || '').trim() || null,
    handle: ((r.handle as string) || '').trim() || null,
    image: ((r.image as string) || '').trim() || null,
    role: (r.role as string) || 'user',
    banned: !!r.banned,
    banReason: ((r.banReason as string) || '').trim() || null,
    createdAt: (r.createdAt as string) ?? null,
    gameCount: n(r.gameCount),
    publicGameCount: n(r.publicGameCount),
    deckCount: n(r.deckCount),
    totalPlays: n(r.totalPlays),
  }))
}

/** Set a user's role ('admin' or 'user'). Returns false if no such user. */
export async function setUserRole(id: string, role: 'admin' | 'user'): Promise<boolean> {
  const db = await useDb()
  const res = await db.update(userTable).set({ role }).where(eq(userTable.id, id))
  return (res.rowsAffected ?? 0) > 0
}

/** Ban or unban a user, recording an optional reason + the moment of the ban. */
export async function setUserBan(id: string, banned: boolean, reason?: string): Promise<boolean> {
  const db = await useDb()
  const res = await db
    .update(userTable)
    .set({
      banned,
      banReason: banned ? (reason?.trim()?.slice(0, 280) || null) : null,
      bannedAt: banned ? Date.now() : null,
    })
    .where(eq(userTable.id, id))
  return (res.rowsAffected ?? 0) > 0
}

// ── Game / deck moderation ───────────────────────────────────────────────────

export interface AdminGameRow {
  id: string
  title: string
  pluginId: string
  visibility: Visibility
  featured: boolean
  plays: number
  lastPlayedAt: number | null
  createdAt: number
  ownerId: string | null
  ownerEmail: string | null
  ownerHandle: string | null
  ownerName: string | null
}

/** List every game (any visibility) with its owner, for moderation. Sort by plays
 *  or recency; optional visibility filter + title/owner search. */
export async function listAllGames(
  opts: { sort?: 'plays' | 'recent'; visibility?: Visibility; q?: string; limit?: number } = {},
): Promise<AdminGameRow[]> {
  const db = await useDb()
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 1000)
  const q = opts.q?.trim().toLowerCase()
  const like = q ? `%${q}%` : null
  const conds: ReturnType<typeof sql>[] = []
  if (opts.visibility) conds.push(sql`g.visibility = ${opts.visibility}`)
  if (like) conds.push(sql`(lower(g.title) LIKE ${like} OR lower(u.email) LIKE ${like} OR lower(u.username) LIKE ${like})`)
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``
  const order = opts.sort === 'recent' ? sql`g.created_at DESC` : sql`g.play_count DESC, g.created_at DESC`
  const rows = (await db.all(sql`
    SELECT
      g.id, g.title, g.plugin_id AS pluginId, g.visibility, g.featured,
      COALESCE(g.play_count, 0) AS plays, g.last_played_at AS lastPlayedAt, g.created_at AS createdAt,
      g.owner_id AS ownerId, u.email AS ownerEmail, u.username AS ownerHandle, u.name AS ownerName
    FROM games g LEFT JOIN user u ON u.id = g.owner_id
    ${where}
    ORDER BY ${order}
    LIMIT ${limit}
  `)) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    pluginId: String(r.pluginId ?? ''),
    visibility: String(r.visibility ?? 'private') as Visibility,
    featured: !!r.featured,
    plays: n(r.plays),
    lastPlayedAt: r.lastPlayedAt == null ? null : n(r.lastPlayedAt),
    createdAt: n(r.createdAt),
    ownerId: (r.ownerId as string) ?? null,
    ownerEmail: (r.ownerEmail as string) ?? null,
    ownerHandle: ((r.ownerHandle as string) || '').trim() || null,
    ownerName: ((r.ownerName as string) || '').trim() || null,
  }))
}

/** Admin override of a game's visibility (e.g. take a game down to `private`). */
export async function adminSetGameVisibility(id: string, visibility: Visibility): Promise<boolean> {
  const db = await useDb()
  const res = await db.update(games).set({ visibility, updatedAt: Date.now() }).where(eq(games.id, id))
  return (res.rowsAffected ?? 0) > 0
}

/** Toggle a game's `featured` curation flag. */
export async function adminSetGameFeatured(id: string, featured: boolean): Promise<boolean> {
  const db = await useDb()
  const res = await db.update(games).set({ featured, updatedAt: Date.now() }).where(eq(games.id, id))
  return (res.rowsAffected ?? 0) > 0
}

/** Delete any game (owner-agnostic), plus its bookmarks. */
export async function adminDeleteGame(id: string): Promise<boolean> {
  const db = await useDb()
  await db.delete(bookmarks).where(eq(bookmarks.gameId, id))
  const res = await db.delete(games).where(eq(games.id, id))
  return (res.rowsAffected ?? 0) > 0
}

export interface AdminDeckRow {
  id: string
  name: string
  kind: string
  game: string | null
  visibility: Visibility
  rowCount: number
  createdAt: number
  ownerId: string | null
  ownerEmail: string | null
  ownerHandle: string | null
}

/** List every deck (any visibility) with its owner, for moderation. */
export async function listAllDecks(opts: { q?: string; limit?: number } = {}): Promise<AdminDeckRow[]> {
  const db = await useDb()
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 1000)
  const q = opts.q?.trim().toLowerCase()
  const like = q ? `%${q}%` : null
  const where = like
    ? sql`WHERE lower(d.name) LIKE ${like} OR lower(u.email) LIKE ${like} OR lower(u.username) LIKE ${like}`
    : sql``
  const rows = (await db.all(sql`
    SELECT
      d.id, d.name, d.kind, d.game, d.visibility, d.rows AS rowsJson, d.created_at AS createdAt,
      d.owner_id AS ownerId, u.email AS ownerEmail, u.username AS ownerHandle
    FROM decks d LEFT JOIN user u ON u.id = d.owner_id
    ${where}
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `)) as Array<Record<string, unknown>>
  return rows.map((r) => {
    let rowCount = 0
    try {
      const parsed = JSON.parse(String(r.rowsJson ?? '[]'))
      rowCount = Array.isArray(parsed) ? parsed.length : 0
    } catch {
      /* leave 0 */
    }
    return {
      id: String(r.id),
      name: String(r.name ?? ''),
      kind: String(r.kind ?? 'generic'),
      game: (r.game as string) ?? null,
      visibility: String(r.visibility ?? 'private') as Visibility,
      rowCount,
      createdAt: n(r.createdAt),
      ownerId: (r.ownerId as string) ?? null,
      ownerEmail: (r.ownerEmail as string) ?? null,
      ownerHandle: ((r.ownerHandle as string) || '').trim() || null,
    }
  })
}

/** Admin override of a deck's visibility. */
export async function adminSetDeckVisibility(id: string, visibility: Visibility): Promise<boolean> {
  const db = await useDb()
  const res = await db.update(decks).set({ visibility, updatedAt: Date.now() }).where(eq(decks.id, id))
  return (res.rowsAffected ?? 0) > 0
}

/** Delete any deck (owner-agnostic). */
export async function adminDeleteDeck(id: string): Promise<boolean> {
  const db = await useDb()
  const res = await db.delete(decks).where(eq(decks.id, id))
  return (res.rowsAffected ?? 0) > 0
}

// ── First-admin bootstrap (one-time, idempotent) ──────────────────────────────

const FIRST_ADMIN_KEY = 'first_admin'

async function getMeta(key: string): Promise<string | null> {
  const db = await useDb()
  const rows = await db.select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, key)).limit(1)
  return rows[0]?.value ?? null
}

async function setMeta(key: string, value: string): Promise<void> {
  const db = await useDb()
  await db
    .insert(appMeta)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: Date.now() } })
}

/**
 * Make the first account ever created an admin, EXACTLY ONCE, forever. Safe to call
 * any number of times and from multiple places (startup + every sign-up): a durable
 * marker in `app_meta` guarantees it never fires twice, even if that admin is later
 * demoted or deleted.
 *
 * Resolution order once it does fire:
 *   1. If a marker already exists -> do nothing (already bootstrapped).
 *   2. If any account already has role='admin' -> just set the marker; never auto-promote.
 *   3. Promote a target account, preferring the earliest account whose email is in
 *      `DOOT_ADMIN_EMAILS` (precise operator control), else the single earliest account.
 *   4. If there are NO accounts yet -> do nothing and DON'T set the marker, so the next
 *      sign-up gets another chance (covers a brand-new, empty deployment).
 */
export async function ensureFirstAdmin(): Promise<void> {
  try {
    if (await getMeta(FIRST_ADMIN_KEY)) return

    const db = await useDb()
    // Use a count (always one row) + db.all (empty array for no rows). A raw db.get()
    // throws on zero rows, so it's unsafe for these "maybe empty" lookups.
    const adminCountRow = (await db.get(sql`SELECT count(*) AS c FROM user WHERE role = 'admin'`)) as
      | { c: unknown }
      | undefined
    if (n(adminCountRow?.c) > 0) {
      await setMeta(FIRST_ADMIN_KEY, JSON.stringify({ note: 'admin already existed', at: Date.now() }))
      return
    }

    type TargetRow = { id: string; email: string | null }
    const allow = [...adminEmailAllowlist()]
    let target: TargetRow | undefined
    if (allow.length) {
      // An explicitly allowlisted email is honored verbatim (even a test domain).
      const placeholders = sql.join(
        allow.map((e) => sql`${e}`),
        sql`, `,
      )
      const rows = (await db.all(sql`
        SELECT id, email FROM user WHERE lower(email) IN (${placeholders}) ORDER BY createdAt ASC LIMIT 1
      `)) as TargetRow[]
      target = rows[0]
    }
    if (!target) {
      // "First account" = first REAL account. Skip the RFC-2606 reserved test domains the
      // playtest/smoke scripts use (e.g. pt_*@example.com), so an automated test account
      // created before the owner's real sign-up can never be the one that gets promoted.
      const TEST_PATTERNS = ['%@example.com', '%@example.org', '%@example.net', '%.test', '%.local', '%.invalid']
      const notTest = sql.join(
        TEST_PATTERNS.map((p) => sql`lower(email) NOT LIKE ${p}`),
        sql` AND `,
      )
      const rows = (await db.all(sql`
        SELECT id, email FROM user WHERE ${notTest} ORDER BY createdAt ASC LIMIT 1
      `)) as TargetRow[]
      target = rows[0]
    }
    if (!target) return // no (real) accounts yet; try again after the first sign-up

    await setUserRole(target.id, 'admin')
    await setMeta(FIRST_ADMIN_KEY, JSON.stringify({ userId: target.id, email: target.email, at: Date.now() }))
    console.log(`[doot] first-admin bootstrap: promoted ${target.email ?? target.id} (${target.id}) to admin.`)
  } catch (err) {
    // Never let a bootstrap hiccup break startup or a sign-up; it retries next time.
    console.error('[doot] first-admin bootstrap skipped:', err instanceof Error ? err.message : err)
  }
}

// ── Play count (a durable historical stat, not live room state) ───────────────

/** Increment a game's play count and stamp the time. Best-effort: a missing game
 *  is a no-op. Called when a host actually starts a room (leaves the lobby). */
export async function recordPlay(id: string): Promise<void> {
  const db = await useDb()
  await db
    .update(games)
    .set({ playCount: sql`COALESCE(${games.playCount}, 0) + 1`, lastPlayedAt: Date.now() })
    .where(eq(games.id, id))
}
