/**
 * Read-only access to public account identity (display name, @handle, avatar,
 * bio) for bylines and profile pages.
 *
 * Accounts live in better-auth's own `user` table (created at startup by
 * `server/plugins/auth-migrate.ts`) in the same libSQL database as the games
 * store. We only ever read the public columns here, NEVER the email, so a
 * published game can credit its author and a profile page can render without
 * leaking an address. A missing table/column (a brand-new DB before auth has
 * migrated) or any read error resolves to no data rather than breaking a listing.
 */
import { eq, inArray } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { useDb } from './db'

// A minimal view of better-auth's `user` table: only the public-safe columns.
// Column names match better-auth's camelCase convention (`username`,
// `displayUsername`); the `bio` additionalField and `image` avatar live here too.
const authUsers = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  username: text('username'),
  image: text('image'),
  bio: text('bio'),
})

/** A public author identity: a display name and (when claimed) a profile handle. */
export interface Author {
  name: string | null
  /** The lowercase @handle (vanity-URL slug), or null if not yet claimed. */
  handle: string | null
}

/** A full public profile (never includes the email). */
export interface PublicProfile {
  id: string
  name: string | null
  handle: string
  image: string | null
  bio: string | null
}

/**
 * Resolve public author identities for a set of account ids. Returns a map of
 * id -> { name, handle }, with empty names coerced to null and missing rows
 * omitted. Used by game listings so a byline can link to /u/@handle when the
 * author has claimed one (plain text otherwise).
 */
export async function authorsFor(ids: string[]): Promise<Map<string, Author>> {
  const out = new Map<string, Author>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  try {
    const db = await useDb()
    const rows = await db
      .select({ id: authUsers.id, name: authUsers.name, username: authUsers.username })
      .from(authUsers)
      .where(inArray(authUsers.id, unique))
    for (const r of rows) {
      const name = r.name?.trim() || null
      const handle = r.username?.trim() || null
      if (name || handle) out.set(r.id, { name, handle })
    }
  } catch {
    // No `user` table/columns yet, or a transient read error: credit no one.
  }
  return out
}

/**
 * Look up a full public profile by its @handle (already stripped of a leading
 * `@`, case-insensitive). Returns null if no account has claimed that handle, so
 * callers can 404 without confirming whether an account exists. NEVER returns
 * the email.
 */
export async function getPublicProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const h = handle.trim().toLowerCase()
  if (!h) return null
  try {
    const db = await useDb()
    const rows = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        username: authUsers.username,
        image: authUsers.image,
        bio: authUsers.bio,
      })
      .from(authUsers)
      .where(eq(authUsers.username, h))
      .limit(1)
    const r = rows[0]
    if (!r || !r.username) return null
    return {
      id: r.id,
      name: r.name?.trim() || null,
      handle: r.username,
      image: r.image?.trim() || null,
      bio: r.bio?.trim() || null,
    }
  } catch {
    // Columns not migrated yet, or a transient read error.
    return null
  }
}
