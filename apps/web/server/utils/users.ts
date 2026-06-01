/**
 * Read-only access to account display names for public-facing bylines.
 *
 * Accounts live in better-auth's own `user` table (created at startup by
 * `server/plugins/auth-migrate.ts`) in the same libSQL database as the games
 * store. We only ever read the `name` here, never the email, so a published
 * game can credit its author without leaking their address. A missing table
 * (a brand-new DB before auth has migrated) or any read error resolves to no
 * names rather than breaking a listing.
 */
import { inArray } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { useDb } from './db'

// A minimal view of better-auth's `user` table: just what a public byline needs.
const authUsers = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
})

/**
 * Resolve display names for a set of account ids. Returns a map of id -> name,
 * with empty/missing names omitted (the caller shows nothing, never the email).
 */
export async function displayNamesFor(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  try {
    const db = await useDb()
    const rows = await db
      .select({ id: authUsers.id, name: authUsers.name })
      .from(authUsers)
      .where(inArray(authUsers.id, unique))
    for (const r of rows) {
      const name = r.name?.trim()
      if (name) out.set(r.id, name)
    }
  } catch {
    // No `user` table yet, or a transient read error: credit no one.
  }
  return out
}

/** Resolve a single account's display name, or null. */
export async function displayNameFor(id: string | null | undefined): Promise<string | null> {
  if (!id) return null
  return (await displayNamesFor([id])).get(id) ?? null
}
