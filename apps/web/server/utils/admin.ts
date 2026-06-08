/**
 * Admin + moderation gating. A small, security-critical seam: it decides who may
 * reach the admin console and the moderation actions, and it enforces account bans
 * on the content-write surface.
 *
 * Two ways to be an admin, checked in this order:
 *  1. `DOOT_ADMIN_EMAILS` (comma-separated) - an env allowlist override. Grants admin
 *     to a known account WITHOUT any DB write, so the owner can't be locked out.
 *  2. `user.role === 'admin'` in the better-auth `user` table - the durable source of
 *     truth. The FIRST account ever created is auto-promoted to this role exactly once
 *     (see `ensureFirstAdmin` in admin-repo.ts); everyone else is promoted from the
 *     console by an existing admin.
 *
 * Every check is server-side; the client never decides admin-ness. The admin nav
 * link and `/admin` page only *reflect* `/api/admin/me`, they don't grant anything.
 */
import { eq } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import { isAllowlistedAdmin } from './admin-config'
import { useDb } from './db'
import { type AuthUser, requireUser } from './session'

// A view of better-auth's `user` table covering only the moderation/role columns we
// read (camelCase, matching better-auth + the auth-migrate fallback that adds them).
const adminUserView = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email'),
  role: text('role'),
  banned: integer('banned', { mode: 'boolean' }),
  banReason: text('banReason'),
})

export interface UserFlags {
  role: string
  banned: boolean
  banReason: string | null
}

/** Read a user's role/ban flags from the durable store. Missing row/columns or a
 *  transient error resolves to safe defaults (not admin, not banned). */
export async function userFlags(id: string): Promise<UserFlags> {
  try {
    const db = await useDb()
    const rows = await db
      .select({ role: adminUserView.role, banned: adminUserView.banned, banReason: adminUserView.banReason })
      .from(adminUserView)
      .where(eq(adminUserView.id, id))
      .limit(1)
    const r = rows[0]
    return { role: r?.role ?? 'user', banned: !!r?.banned, banReason: r?.banReason ?? null }
  } catch {
    return { role: 'user', banned: false, banReason: null }
  }
}

/** Whether a signed-in user is an admin (env allowlist OR a stored `admin` role). */
export async function isAdmin(user: AuthUser): Promise<boolean> {
  if (isAllowlistedAdmin(user.email)) return true
  return (await userFlags(user.id)).role === 'admin'
}

/** Throw 403 if this user is banned (env-allowlisted admins are never blocked, so a
 *  ban can't lock the owner out). Used to gate the content-write surface. */
export async function assertNotBanned(user: AuthUser): Promise<void> {
  if (isAllowlistedAdmin(user.email)) return
  const flags = await userFlags(user.id)
  if (flags.banned) {
    throw createError({
      statusCode: 403,
      statusMessage: flags.banReason ? `Your account is suspended: ${flags.banReason}` : 'Your account is suspended.',
    })
  }
}

/** The signed-in user, or 401, AND 403 if they're banned. Use on every authed
 *  content-write route so a banned account can't keep saving/editing. */
export async function requireActiveUser(event: H3Event): Promise<AuthUser> {
  const user = await requireUser(event)
  await assertNotBanned(user)
  return user
}

/** Require an admin: 401 if signed out, 403 if not an admin. Returns the user. */
export async function requireAdmin(event: H3Event): Promise<AuthUser> {
  const user = await requireUser(event)
  if (!(await isAdmin(user))) {
    throw createError({ statusCode: 403, statusMessage: 'Admins only.' })
  }
  return user
}
