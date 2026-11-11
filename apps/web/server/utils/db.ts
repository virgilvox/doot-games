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
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { markMigrationDone, recordMigrationFailure, runAdditive } from './migration-status'

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
  /** How many times this game has been hosted (a live room actually started). A
   *  historical stat (PRD §1 allows durable historical stats), incremented best-effort
   *  by the host when a room leaves the lobby. Nothing else about a live room is stored. */
  playCount: integer('play_count').notNull().default(0),
  /** When this game was last hosted (epoch ms), or null if never. */
  lastPlayedAt: integer('last_played_at'),
  /** Admin curation flag: a featured game an admin has chosen to spotlight. */
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** A reusable content deck: a named-column table of rows ("cards") that games bind
 *  to (a `{ ref }`), or copy in as a snapshot. Decks live independently of games —
 *  authored, browsed, and remixed on their own, like games. Answer-hiding is NOT a
 *  property of a library deck (it has no round context); a column only becomes secret
 *  when a *game* binds it to an answer field, which the game serve path redacts. */
export const decks = sqliteTable('decks', {
  id: text('id').primaryKey(),
  /** Owning account, or null for pre-auth / anonymous saves (matches `games`). */
  ownerId: text('owner_id'),
  name: text('name').notNull(),
  /** Optional one-line description shown on cards. */
  description: text('description'),
  /** A descriptor hint: 'quiz' | 'prompt' | 'card' | 'generic' (arbitrary columns). */
  kind: text('kind').notNull().default('generic'),
  /** Optional id of the game this deck is authored for (e.g. 'quip-clash'), so the library
   *  can group/filter decks by game. A hint, not a constraint: a deck still works in any
   *  compatible game. Null for a general-purpose deck. */
  game: text('game'),
  /** JSON-serialized DeckColumn[] (`{ key, label, type }`). */
  columns: text('columns').notNull(),
  /** JSON-serialized rows (`Record<string, string|number|null>[]`). */
  rows: text('rows').notNull(),
  /** 'private' (owner only), 'unlisted' (anyone with the link), or 'public' (listed). */
  visibility: text('visibility').notNull().default('private'),
  /** Whether others may copy this deck into their own library. */
  remixable: integer('remixable', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** A saved SESSION lineup ("playlist"): an ordered list of game ids played back to
 *  back in one room. Owned + visibility'd like games/decks. Ephemeral play state is
 *  never stored here, only the durable lineup the host curated. */
export const playlists = sqliteTable('playlists', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id'),
  name: text('name').notNull(),
  description: text('description'),
  /** JSON-serialized string[] of game ids, in play order. */
  games: text('games').notNull(),
  visibility: text('visibility').notNull().default('private'),
  remixable: integer('remixable', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** A user's bookmark ("save") of a game, so they can find it again. One row per
 *  (user, game); the user id is better-auth's account id. */
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    userId: text('user_id').notNull(),
    gameId: text('game_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.gameId] }) }),
)

/** A post-game content report filed by a player from the results screen. Anonymous
 *  (players have no account) and durable so a moderator can triage it later. This is
 *  NOT live room state: the room is already over when a report is filed; we keep only
 *  the few breadcrumbs a moderator needs to find the offending game/room. */
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  /** Why it was reported (a fixed category; see REPORT_REASONS). */
  reason: text('reason').notNull(),
  /** Optional free-text the reporter added (capped). */
  detail: text('detail'),
  /** The live room's join code at report time (ephemeral, kept only as a breadcrumb). */
  roomCode: text('room_code'),
  /** The reported game's title + type, so a moderator can locate a saved/public game. */
  gameTitle: text('game_title'),
  pluginId: text('plugin_id'),
  /** Triage state: 'open' (new), 'reviewed' (actioned), or 'dismissed' (no action). */
  status: text('status').notNull().default('open'),
  createdAt: integer('created_at').notNull(),
  /** When a moderator last changed the status, or null while open. */
  reviewedAt: integer('reviewed_at'),
})

/** A tiny durable key/value store for app-level flags that must persist and run
 *  once (e.g. the first-admin bootstrap marker). NOT room state. */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at').notNull(),
})

/** Game visibility levels. */
export type Visibility = 'private' | 'unlisted' | 'public'
export const VISIBILITIES: Visibility[] = ['private', 'unlisted', 'public']

/** The fixed reasons a player can pick when reporting a game from the results
 *  screen. Kept here as the single server-side source of truth; the report button's
 *  client labels mirror this list (see ReportButton.vue). */
export const REPORT_REASONS = ['offensive', 'sexual', 'harassment', 'spam', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]
/** Triage states for a filed report. */
export const REPORT_STATUSES = ['open', 'reviewed', 'dismissed'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

const DEFAULT_URL = 'file:./.data/doot.sqlite'

/** The resolved libSQL URL, shared by the games store and better-auth. */
export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim()
  let url = raw || DEFAULT_URL
  if (raw?.startsWith('postgres')) {
    console.warn('[doot] Postgres is not wired yet; using the local SQLite file. See HANDOFF.md.')
    url = DEFAULT_URL
  }
  assertExistingDb(url)
  return url
}

let existingDbChecked = false

/**
 * Refuse to run against a MISSING database file when the deployment says one must
 * already exist (`DOOT_REQUIRE_EXISTING_DB=1`, set by the production compose).
 *
 * libSQL silently creates an empty file for any `file:` URL. If a deploy ever
 * changed the volume mount or the DATABASE_URL path, the app would boot "healthy"
 * on an empty database, every account and game would appear gone, and the first
 * new sign-up would be auto-promoted to admin. Crashing at boot instead keeps the
 * real data untouched and makes the deploy's readiness wait fail and roll back.
 * Fresh self-hosted installs and local dev don't set the flag, so they are unaffected.
 */
function assertExistingDb(url: string): void {
  if (existingDbChecked || process.env.DOOT_REQUIRE_EXISTING_DB !== '1') return
  if (!url.startsWith('file:')) {
    existingDbChecked = true
    return
  }
  const path = resolve(url.slice('file:'.length))
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(
      `[doot] DOOT_REQUIRE_EXISTING_DB=1 but the database file ${path} is missing or empty. Refusing to start on an empty database. Check the data volume mount and DATABASE_URL.`,
    )
  }
  existingDbChecked = true
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
  // Additive migrations for databases created before auth/visibility. Only the
  // benign "duplicate column" outcome is swallowed; a real failure is recorded and
  // turns /api/ready red (see migration-status.ts).
  const exec = (sql: string) => c.execute(sql)
  for (const ddl of [
    'ALTER TABLE games ADD COLUMN owner_id TEXT',
    "ALTER TABLE games ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'",
    'ALTER TABLE games ADD COLUMN description TEXT',
    'ALTER TABLE games ADD COLUMN tags TEXT',
    'ALTER TABLE games ADD COLUMN cover_image TEXT',
    'ALTER TABLE games ADD COLUMN forkable INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE games ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE games ADD COLUMN last_played_at INTEGER',
    'ALTER TABLE games ADD COLUMN featured INTEGER NOT NULL DEFAULT 0',
  ]) {
    await runAdditive('app-schema', exec, ddl)
  }
  // Indexes for the listing queries (owner's games, public games).
  await c.execute('CREATE INDEX IF NOT EXISTS games_owner_idx ON games(owner_id)')
  await c.execute('CREATE INDEX IF NOT EXISTS games_visibility_idx ON games(visibility)')
  // Bookmarks (a user "saving" a game to find later); one row per (user, game).
  await c.execute(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, game_id)
    )
  `)
  await c.execute('CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks(user_id)')
  // Reusable content decks (the `/decks` library; a game references one by id).
  await c.execute(`
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      kind TEXT NOT NULL DEFAULT 'generic',
      game TEXT,
      columns TEXT NOT NULL,
      rows TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      remixable INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  // Pre-`game` decks tables (created before the column existed) get it here. This
  // must come AFTER the CREATE above: on a fresh database it would otherwise run
  // against a table that doesn't exist yet.
  await runAdditive('app-schema', exec, 'ALTER TABLE decks ADD COLUMN game TEXT')
  await c.execute('CREATE INDEX IF NOT EXISTS decks_owner_idx ON decks(owner_id)')
  await c.execute('CREATE INDEX IF NOT EXISTS decks_visibility_idx ON decks(visibility)')
  // Session lineups ("playlists"): an ordered list of game ids played back to back.
  await c.execute(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      games TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      remixable INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  await c.execute('CREATE INDEX IF NOT EXISTS playlists_owner_idx ON playlists(owner_id)')
  await c.execute('CREATE INDEX IF NOT EXISTS playlists_visibility_idx ON playlists(visibility)')
  // Post-game content reports (anonymous, filed from the results screen).
  await c.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      detail TEXT,
      room_code TEXT,
      game_title TEXT,
      plugin_id TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER
    )
  `)
  // The moderation queue lists open reports newest-first.
  await c.execute('CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at)')
  // App-level persistent flags (e.g. the one-time first-admin bootstrap marker).
  await c.execute(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER NOT NULL
    )
  `)
}

async function init(): Promise<LibSQLDatabase> {
  const url = databaseUrl()
  if (url.startsWith('file:')) {
    // libSQL won't create missing parent directories for a file URL.
    mkdirSync(dirname(url.slice('file:'.length)), { recursive: true })
  }
  const client = createClient({ url })
  const db = drizzle(client)
  try {
    await ensureSchema(client)
  } catch (err) {
    recordMigrationFailure('app-schema', err)
    throw err
  }
  markMigrationDone('app-schema')
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
