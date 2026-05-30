/**
 * The durable store, game definitions only. Per Doot's architecture, nothing
 * about an in-progress room is ever written here; live state lives on the relay.
 *
 * Drizzle over libSQL keeps the app zero-config in development: with no
 * `DATABASE_URL` it opens a local SQLite file (`.data/doot.sqlite`). A libSQL /
 * Turso URL (`file:`, `libsql://`, `http(s)://`) is used as-is. Postgres for
 * production is a documented follow-up; until then a `postgres://` URL falls
 * back to the local file with a warning so the app still runs.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Accounts/sessions are owned by better-auth (its own tables); this store holds
// only game definitions. See server/utils/auth.ts.

/** A saved game definition (a composition authored in the editor). */
export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull(),
  title: text('title').notNull(),
  themeId: text('theme_id').notNull().default('doot'),
  /** JSON-serialized GameComposition (`{ title, rounds: [{ block, content }] }`). */
  config: text('config').notNull(),
  /** Owning account, or null for pre-auth / anonymous saves. */
  ownerId: text('owner_id'),
  /** 'private' (owner only), 'unlisted' (anyone with the link), or 'public' (listed). */
  visibility: text('visibility').notNull().default('private'),
  /** Optional one-line description shown on cards and the detail page. */
  description: text('description'),
  /** JSON array of short tags, or null. */
  tags: text('tags'),
  /** Optional cover image URL. */
  coverImage: text('cover_image'),
  /** Whether others may fork (copy) this game into their own editor. */
  forkable: integer('forkable', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Game visibility levels. */
export type Visibility = 'private' | 'unlisted' | 'public'
export const VISIBILITIES: Visibility[] = ['private', 'unlisted', 'public']

const DEFAULT_URL = 'file:./.data/doot.sqlite'

/** The resolved libSQL URL, shared by the games store and better-auth. */
export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim()
  if (!raw) return DEFAULT_URL
  if (raw.startsWith('postgres')) {
    console.warn('[doot] Postgres is not wired yet; using the local SQLite file. See HANDOFF.md.')
    return DEFAULT_URL
  }
  return raw
}

let initPromise: Promise<LibSQLDatabase> | null = null

async function ensureSchema(c: Client): Promise<void> {
  await c.execute(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      title TEXT NOT NULL,
      theme_id TEXT NOT NULL DEFAULT 'doot',
      config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  // Additive migrations for databases created before auth/visibility (SQLite
  // errors on a duplicate column, ignore that).
  for (const ddl of [
    'ALTER TABLE games ADD COLUMN owner_id TEXT',
    "ALTER TABLE games ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'",
    'ALTER TABLE games ADD COLUMN description TEXT',
    'ALTER TABLE games ADD COLUMN tags TEXT',
    'ALTER TABLE games ADD COLUMN cover_image TEXT',
    'ALTER TABLE games ADD COLUMN forkable INTEGER NOT NULL DEFAULT 0',
  ]) {
    try {
      await c.execute(ddl)
    } catch {
      /* column already exists */
    }
  }
  // Indexes for the listing queries (owner's games, public games).
  await c.execute('CREATE INDEX IF NOT EXISTS games_owner_idx ON games(owner_id)')
  await c.execute('CREATE INDEX IF NOT EXISTS games_visibility_idx ON games(visibility)')
}

async function init(): Promise<LibSQLDatabase> {
  const url = databaseUrl()
  if (url.startsWith('file:')) {
    // libSQL won't create missing parent directories for a file URL.
    mkdirSync(dirname(url.slice('file:'.length)), { recursive: true })
  }
  const client = createClient({ url })
  const db = drizzle(client)
  await ensureSchema(client)
  return db
}

/**
 * Get the Drizzle handle, creating the connection and schema on first use.
 * A single shared init promise makes concurrent first-callers safe (no double
 * connect, no duplicate schema runs).
 */
export function useDb(): Promise<LibSQLDatabase> {
  if (!initPromise) {
    // Don't cache a rejected init, a transient failure should be retryable.
    initPromise = init().catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}
