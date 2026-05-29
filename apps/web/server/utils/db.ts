/**
 * The durable store — game definitions only. Per Doot's architecture, nothing
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

/** A saved game definition (a composition authored in the editor). */
export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull(),
  title: text('title').notNull(),
  themeId: text('theme_id').notNull().default('doot'),
  /** JSON-serialized GameComposition (`{ title, rounds: [{ block, content }] }`). */
  config: text('config').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

const DEFAULT_URL = 'file:./.data/doot.sqlite'

function resolveUrl(): string {
  const raw = process.env.DATABASE_URL?.trim()
  if (!raw) return DEFAULT_URL
  if (raw.startsWith('postgres')) {
    console.warn('[doot] Postgres is not wired yet; using the local SQLite file. See HANDOFF.md.')
    return DEFAULT_URL
  }
  return raw
}

let client: Client | null = null
let db: LibSQLDatabase | null = null
let ready: Promise<void> | null = null

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
}

/** Get the Drizzle handle, creating the connection and table on first use. */
export async function useDb(): Promise<LibSQLDatabase> {
  if (!db || !client) {
    const url = resolveUrl()
    if (url.startsWith('file:')) {
      // libSQL won't create missing parent directories for a file URL.
      mkdirSync(dirname(url.slice('file:'.length)), { recursive: true })
    }
    client = createClient({ url })
    db = drizzle(client)
  }
  if (!ready) ready = ensureSchema(client)
  await ready
  return db
}
