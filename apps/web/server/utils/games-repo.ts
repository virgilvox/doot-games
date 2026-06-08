/**
 * Saved-game persistence: validate at the boundary, then read/write the durable
 * store. Validation is shape + known-plugin only (deep per-round content is
 * validated client-side in the editor); a saved config carries no secrets, the
 * host derives answer keys from it at play time, never the server.
 *
 * Games are owned and have a visibility: `private` (owner only), `unlisted`
 * (anyone with the link), or `public` (also listed for discovery). They also
 * carry display metadata (description, tags, cover image) and a `forkable` flag
 * letting others copy a game into their own editor.
 */
import { REDACTION_RULES, isKnownPlugin, redactDecks } from '@doot-games/games/catalog'
import { z } from '@doot-games/sdk'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { type Visibility, bookmarks, games, useDb } from './db'
import { loadDecksForServe } from './decks-repo'
import { authorsFor } from './users'

const deckRefSchema = z.object({ deck: z.string().min(1).max(64), column: z.string().min(1).max(64) })
const roundSchema = z.object({
  block: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
  // A derived round's source indices (default [index-1]). Adjacent two-phase
  // games omit it, but persist it so a non-adjacent source survives save/load.
  from: z.array(z.number().int().nonnegative()).optional(),
  // Deck-backed rounds (additive; see docs/content-decks-plan.md). `draw` emits N
  // instances each from a distinct drawn row; `bindings` fill fields from columns;
  // `pool` builds the whole content from a row (typed). Resolved at host time.
  draw: z.number().int().positive().max(200).optional(),
  bindings: z.record(z.string().max(80), deckRefSchema).optional(),
  pool: z.object({ deck: z.string().min(1).max(64) }).optional(),
  // Play-time variable: fill a field from a prior collect round's shares (resolved
  // at advance). Additive; ordinary rounds omit it.
  fromShares: z
    .object({
      from: z.number().int().nonnegative().optional(),
      field: z.string().min(1).max(80),
      value: z.enum(['media', 'text']).optional(),
      pick: z.enum(['random', 'first']).optional(),
    })
    .optional(),
})

const deckColumnSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().max(80).default(''),
  type: z.enum(['text', 'image', 'number']),
})
const deckSchema = z.object({
  columns: z.array(deckColumnSchema).max(50),
  rows: z.array(z.record(z.string().max(64), z.union([z.string().max(2000), z.number(), z.null()]))).max(1000),
  kind: z.string().max(40).optional(),
})
const deckUseSchema = z.union([
  z.object({ inline: deckSchema }),
  z.object({ ref: z.string().min(1).max(64), version: z.number().int().nonnegative().optional() }),
])

export const gameInputSchema = z.object({
  pluginId: z.string().min(1),
  themeId: z.string().min(1).max(40).optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
  description: z.string().trim().max(300).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  coverImage: z.string().trim().max(2000).optional(),
  forkable: z.boolean().optional(),
  config: z.object({
    title: z.string().trim().min(1).max(120),
    rounds: z.array(roundSchema).min(1).max(50),
    decks: z.record(z.string().max(64), deckUseSchema).optional(),
  }),
})

export type GameInput = z.infer<typeof gameInputSchema>

export interface GameMeta {
  description: string | null
  tags: string[]
  coverImage: string | null
  forkable: boolean
}

/** A round as stored. `content` stays an open record; the deck fields are additive. */
interface SavedRound {
  block: string
  content: Record<string, unknown>
  from?: number[]
  draw?: number
  bindings?: Record<string, { deck: string; column: string }>
  pool?: { deck: string }
  fromShares?: { from?: number; field: string; value?: 'media' | 'text'; pick?: 'random' | 'first' }
}
interface SavedInlineDeck {
  columns: Array<{ key: string; label: string; type: 'text' | 'image' | 'number' }>
  rows: Array<Record<string, string | number | null>>
  kind?: string
}
type SavedDeckUse = { inline: SavedInlineDeck } | { ref: string; version?: number }
export interface SavedConfig {
  title: string
  rounds: SavedRound[]
  decks?: Record<string, SavedDeckUse>
}

export interface SavedGame extends GameMeta {
  id: string
  pluginId: string
  title: string
  themeId: string
  ownerId: string | null
  visibility: Visibility
  config: SavedConfig
  createdAt: number
}

export interface SavedGameSummary extends GameMeta {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: Visibility
  /** The author's display name (never their email), or null. */
  authorName: string | null
  /** The author's claimed @handle (lowercase), or null. Lets a card link to
   *  /u/@handle; absent until the author claims a handle in /account. */
  authorHandle: string | null
  /** Admin-curated spotlight flag. Featured games sort first in public listings. */
  featured: boolean
  createdAt: number
}

function newId(): string {
  return `g_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

// A saved config carries no media bytes (images are URLs), so a legitimate game
// is small. Cap the serialized size to keep one user from storing a multi-MB
// blob 50 rounds deep (the per-round `content` is an open record).
// Raised to hold a content deck (up to ~1000 text/URL rows). A deck of text is still
// small; images are URLs, so a legitimate game stays well under this.
const MAX_CONFIG_BYTES = 2_000_000
function serializeConfig(config: GameInput['config']): string {
  const s = JSON.stringify(config)
  if (s.length > MAX_CONFIG_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'This game is too large to save.' })
  }
  return s
}

/** Map a validated input to the metadata columns (shared by create + update). */
function metaColumns(input: GameInput) {
  return {
    themeId: input.themeId ?? 'doot',
    visibility: input.visibility ?? 'private',
    description: input.description?.length ? input.description : null,
    tags: input.tags?.length ? JSON.stringify(input.tags) : null,
    coverImage: input.coverImage?.length ? input.coverImage : null,
    forkable: input.forkable ?? false,
  }
}

function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const t = JSON.parse(raw)
    return Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const SUMMARY_COLUMNS = {
  id: games.id,
  pluginId: games.pluginId,
  title: games.title,
  themeId: games.themeId,
  visibility: games.visibility,
  ownerId: games.ownerId,
  description: games.description,
  tags: games.tags,
  coverImage: games.coverImage,
  forkable: games.forkable,
  featured: games.featured,
  createdAt: games.createdAt,
}

interface SummaryRow {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: string
  ownerId: string | null
  description: string | null
  tags: string | null
  coverImage: string | null
  forkable: boolean
  featured: boolean
  createdAt: number
}

/** Map rows to summaries, crediting each game's author by display name (ownerId
 *  is resolved to a name here and never sent to the client). */
async function toSummaries(rows: SummaryRow[]): Promise<SavedGameSummary[]> {
  const authors = await authorsFor(rows.map((r) => r.ownerId ?? ''))
  return rows.map((r) => {
    const author = r.ownerId ? authors.get(r.ownerId) : undefined
    return {
      id: r.id,
      pluginId: r.pluginId,
      title: r.title,
      themeId: r.themeId,
      visibility: r.visibility as Visibility,
      // When a handle is claimed, the byline shows the @handle, so don't expose
      // the (often email-derived) display name in the payload at all.
      authorName: author?.handle ? null : (author?.name ?? null),
      authorHandle: author?.handle ?? null,
      description: r.description,
      tags: parseTags(r.tags),
      coverImage: r.coverImage,
      forkable: r.forkable,
      featured: r.featured,
      createdAt: r.createdAt,
    }
  })
}

/**
 * Strip answer keys from a saved config before serving it to anyone who isn't
 * the owner, so the answer-withholding invariant holds for the API too, not just
 * the live relay. Driven by REDACTION_RULES (the server-safe block→answer-field
 * map), which a catalog test keeps in sync with every block's `answerOf`.
 */
export function redactConfigForViewer(config: SavedGame['config'], pluginId?: string): SavedGame['config'] {
  return {
    ...config,
    rounds: config.rounds.map((r) => {
      const rule = REDACTION_RULES[r.block]
      return rule ? { ...r, content: { ...r.content, ...rule } } : r
    }),
    // Strip any deck column a round binds to an answer field, plus a typed pool deck's
    // answer columns (named by the game's contentPool), so a deck-backed game never leaks
    // answers to a non-owner (the same invariant as round content). `pluginId` enables
    // the pool-deck case.
    decks: redactDecks(config.rounds, config.decks, pluginId) as SavedConfig['decks'],
  }
}

/**
 * Resolve every `{ ref: 'lib_…' }` deck use in a config to an inline snapshot by
 * loading the referenced library deck, so the client resolver only ever sees inline
 * decks (it stays reference-agnostic). Run on the **play** read path only (`?for=play`),
 * never the editor read — the editor must keep refs intact to re-save them.
 *
 * `gameOwnerId` decides which decks may be inlined: the game's own private decks
 * (the owner chose to embed them) plus any unlisted/public deck. A stranger's private
 * deck, or a deleted ref, drops out — the resolver is missing-safe, so a round bound
 * to a dropped deck keeps its authored values. Inline (snapshot) decks pass through.
 */
export async function resolveDeckRefs(config: SavedConfig, gameOwnerId: string | null): Promise<SavedConfig> {
  const uses = config.decks
  if (!uses) return config
  const refIds = Object.values(uses).flatMap((u) => ('ref' in u ? [u.ref] : []))
  if (refIds.length === 0) return config
  const loaded = await loadDecksForServe(refIds, gameOwnerId)
  const decks: Record<string, SavedDeckUse> = {}
  for (const [key, use] of Object.entries(uses)) {
    if ('ref' in use) {
      const d = loaded[use.ref]
      if (d) decks[key] = { inline: { columns: d.columns, rows: d.rows } }
      // else: an unresolvable ref drops out (missing-safe).
    } else {
      decks[key] = use
    }
  }
  return { ...config, decks }
}

export async function createGame(input: GameInput, ownerId: string): Promise<{ id: string }> {
  if (!isKnownPlugin(input.pluginId)) {
    throw createError({ statusCode: 422, statusMessage: `Unknown game type: ${input.pluginId}` })
  }
  const db = await useDb()
  const now = Date.now()
  const id = newId()
  await db.insert(games).values({
    id,
    pluginId: input.pluginId,
    title: input.config.title,
    config: serializeConfig(input.config),
    ownerId,
    ...metaColumns(input),
    createdAt: now,
    updatedAt: now,
  })
  return { id }
}

/**
 * Full update of a saved game, owner only. A metadata field is changed only when
 * the body actually carries it: an *omitted* field is left as-is, while an
 * explicit empty value (`''`/`[]`) clears it. This stops a rounds-only PUT from
 * silently resetting visibility/forkable/description back to defaults.
 */
export async function updateGame(id: string, ownerId: string, input: GameInput): Promise<boolean> {
  const set: Record<string, unknown> = {
    title: input.config.title,
    config: serializeConfig(input.config),
    updatedAt: Date.now(),
  }
  if (input.themeId !== undefined) set.themeId = input.themeId
  if (input.visibility !== undefined) set.visibility = input.visibility
  if (input.forkable !== undefined) set.forkable = input.forkable
  if (input.description !== undefined) set.description = input.description.length ? input.description : null
  if (input.tags !== undefined) set.tags = input.tags.length ? JSON.stringify(input.tags) : null
  if (input.coverImage !== undefined) set.coverImage = input.coverImage.length ? input.coverImage : null
  const db = await useDb()
  const res = await db.update(games).set(set).where(and(eq(games.id, id), eq(games.ownerId, ownerId)))
  return (res.rowsAffected ?? 0) > 0
}

/**
 * Copy a game into a new one owned by the requester. You can copy your own game,
 * or anyone's game that they marked `forkable` and you're allowed to see. The
 * copy is made from the *stored* config (answers intact) rather than the redacted
 * view, so forking a Guess game keeps its answer key. A fresh copy starts
 * `private` and non-forkable until its new owner opts in.
 */
export async function cloneGame(id: string, requesterId: string): Promise<{ id: string }> {
  const db = await useDb()
  const rows = await db.select().from(games).where(eq(games.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  const visibility = row.visibility as Visibility
  const isOwner = !!row.ownerId && row.ownerId === requesterId
  const viewable = isOwner || visibility !== 'private'
  if (!viewable || (!isOwner && !row.forkable)) {
    throw createError({ statusCode: 403, statusMessage: 'This game cannot be copied.' })
  }
  let config: SavedGame['config']
  try {
    config = JSON.parse(row.config)
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'The source game is corrupt.' })
  }
  // Snapshot any referenced library deck the FORKER can read into the fork, so the copy
  // is self-contained (a live `{ ref }` to the original owner's private deck would
  // silently break for the forker). Decks the forker can't read drop out (missing-safe).
  config = await resolveDeckRefs(config, requesterId)
  const now = Date.now()
  const newGameId = newId()
  await db.insert(games).values({
    id: newGameId,
    pluginId: row.pluginId,
    title: `${row.title} (copy)`,
    config: serializeConfig(config),
    ownerId: requesterId,
    themeId: row.themeId,
    visibility: 'private',
    description: row.description,
    tags: row.tags,
    coverImage: row.coverImage,
    forkable: false,
    createdAt: now,
    updatedAt: now,
  })
  return { id: newGameId }
}

/**
 * Patch a game's display/visibility metadata WITHOUT touching its rounds, owner
 * only. Each field is changed only when present; an explicit empty string/array
 * clears the column, an omitted field is left as-is. Returns false if no such
 * game is owned by the user (or no fields were given).
 */
export async function patchGameMeta(
  id: string,
  ownerId: string,
  fields: {
    visibility?: Visibility
    forkable?: boolean
    description?: string
    coverImage?: string
    tags?: string[]
    themeId?: string
  },
): Promise<boolean> {
  const set: Record<string, unknown> = {}
  if (fields.visibility) set.visibility = fields.visibility
  if (typeof fields.forkable === 'boolean') set.forkable = fields.forkable
  if (fields.description !== undefined) set.description = fields.description.length ? fields.description : null
  if (fields.coverImage !== undefined) set.coverImage = fields.coverImage.length ? fields.coverImage : null
  if (fields.tags !== undefined) set.tags = fields.tags.length ? JSON.stringify(fields.tags) : null
  if (fields.themeId) set.themeId = fields.themeId
  if (Object.keys(set).length === 0) return false // nothing to change
  set.updatedAt = Date.now()
  const db = await useDb()
  const res = await db.update(games).set(set).where(and(eq(games.id, id), eq(games.ownerId, ownerId)))
  return (res.rowsAffected ?? 0) > 0
}

/** Delete a saved game, owner only. Returns true if a row was deleted. */
export async function deleteGame(id: string, ownerId: string): Promise<boolean> {
  const db = await useDb()
  const res = await db.delete(games).where(and(eq(games.id, id), eq(games.ownerId, ownerId)))
  return (res.rowsAffected ?? 0) > 0
}

/** The current user's games (any visibility), most recent first. */
export async function listMyGames(ownerId: string, limit = 100): Promise<SavedGameSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(games)
    .where(eq(games.ownerId, ownerId))
    .orderBy(desc(games.createdAt))
    .limit(limit)
  return toSummaries(rows as SummaryRow[])
}

/** Publicly listed games (visibility = public): admin-featured first, then most recent. */
export async function listPublicGames(limit = 100): Promise<SavedGameSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(games)
    .where(eq(games.visibility, 'public'))
    .orderBy(desc(games.featured), desc(games.createdAt))
    .limit(limit)
  return toSummaries(rows as SummaryRow[])
}

/** A single owner's publicly listed games (for their /u/@handle profile page),
 *  most recent first. Only `public` visibility, so a profile never exposes the
 *  owner's private or unlisted games. */
export async function listPublicGamesByOwner(ownerId: string, limit = 100): Promise<SavedGameSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(games)
    .where(and(eq(games.ownerId, ownerId), eq(games.visibility, 'public')))
    .orderBy(desc(games.createdAt))
    .limit(limit)
  return toSummaries(rows as SummaryRow[])
}

/**
 * Fetch a game by id, enforcing visibility: `private` games are returned only to
 * their owner; `unlisted`/`public` are open to anyone with the link. A hidden
 * game reads as "not found" so its existence doesn't leak.
 */
export async function getGame(id: string, requesterId: string | null): Promise<SavedGame | null> {
  const db = await useDb()
  const rows = await db.select().from(games).where(eq(games.id, id)).limit(1)
  const row = rows[0]
  if (!row) return null
  const visibility = row.visibility as Visibility
  // A null owner (legacy pre-auth row) must never match a null requester, or an
  // anonymous viewer would read every owner-less private game.
  if (visibility === 'private' && (!row.ownerId || row.ownerId !== requesterId)) return null
  let config: SavedGame['config']
  try {
    config = JSON.parse(row.config)
  } catch {
    return null // a corrupt row reads as not-found rather than throwing
  }
  return {
    id: row.id,
    pluginId: row.pluginId,
    title: row.title,
    themeId: row.themeId,
    ownerId: row.ownerId,
    visibility,
    description: row.description,
    tags: parseTags(row.tags),
    coverImage: row.coverImage,
    forkable: row.forkable,
    config,
    createdAt: row.createdAt,
  }
}

// ── Bookmarks (C12: save a game to find it again) ───────────────────────────

/** Save a game to a user's bookmarks (idempotent). */
export async function addBookmark(userId: string, gameId: string): Promise<void> {
  const db = await useDb()
  await db.insert(bookmarks).values({ userId, gameId, createdAt: Date.now() }).onConflictDoNothing()
}

/** Remove a game from a user's bookmarks (idempotent). */
export async function removeBookmark(userId: string, gameId: string): Promise<void> {
  const db = await useDb()
  await db.delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.gameId, gameId)))
}

/** Whether the user has this game bookmarked. */
export async function isBookmarked(userId: string, gameId: string): Promise<boolean> {
  const db = await useDb()
  const rows = await db
    .select({ gameId: bookmarks.gameId })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.gameId, gameId)))
    .limit(1)
  return rows.length > 0
}

/**
 * A user's bookmarked games, newest save first. Only games still visible to them
 * (public/unlisted, or their own) are returned, so a game that later went private
 * drops out of the saved list instead of leaking its title.
 */
export async function listBookmarkedGames(userId: string, limit = 100): Promise<SavedGameSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(bookmarks)
    .innerJoin(games, eq(games.id, bookmarks.gameId))
    .where(
      and(
        eq(bookmarks.userId, userId),
        or(inArray(games.visibility, ['public', 'unlisted']), eq(games.ownerId, userId)),
      ),
    )
    .orderBy(desc(bookmarks.createdAt))
    .limit(limit)
  return toSummaries(rows as SummaryRow[])
}
