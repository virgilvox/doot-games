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
import { REDACTION_RULES, isKnownPlugin } from '@doot-games/games/catalog'
import { z } from '@doot-games/sdk'
import { and, desc, eq } from 'drizzle-orm'
import { type Visibility, games, useDb } from './db'

const roundSchema = z.object({
  block: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
})

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
  }),
})

export type GameInput = z.infer<typeof gameInputSchema>

export interface GameMeta {
  description: string | null
  tags: string[]
  coverImage: string | null
  forkable: boolean
}

export interface SavedGame extends GameMeta {
  id: string
  pluginId: string
  title: string
  themeId: string
  ownerId: string | null
  visibility: Visibility
  config: { title: string; rounds: Array<{ block: string; content: Record<string, unknown> }> }
  createdAt: number
}

export interface SavedGameSummary extends GameMeta {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: Visibility
  createdAt: number
}

function newId(): string {
  return `g_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

// A saved config carries no media bytes (images are URLs), so a legitimate game
// is small. Cap the serialized size to keep one user from storing a multi-MB
// blob 50 rounds deep (the per-round `content` is an open record).
const MAX_CONFIG_BYTES = 512_000
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
  description: games.description,
  tags: games.tags,
  coverImage: games.coverImage,
  forkable: games.forkable,
  createdAt: games.createdAt,
}

interface SummaryRow {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: string
  description: string | null
  tags: string | null
  coverImage: string | null
  forkable: boolean
  createdAt: number
}

function toSummary(r: SummaryRow): SavedGameSummary {
  return {
    id: r.id,
    pluginId: r.pluginId,
    title: r.title,
    themeId: r.themeId,
    visibility: r.visibility as Visibility,
    description: r.description,
    tags: parseTags(r.tags),
    coverImage: r.coverImage,
    forkable: r.forkable,
    createdAt: r.createdAt,
  }
}

/**
 * Strip answer keys from a saved config before serving it to anyone who isn't
 * the owner, so the answer-withholding invariant holds for the API too, not just
 * the live relay. Driven by REDACTION_RULES (the server-safe block→answer-field
 * map), which a catalog test keeps in sync with every block's `answerOf`.
 */
export function redactConfigForViewer(config: SavedGame['config']): SavedGame['config'] {
  return {
    ...config,
    rounds: config.rounds.map((r) => {
      const rule = REDACTION_RULES[r.block]
      return rule ? { ...r, content: { ...r.content, ...rule } } : r
    }),
  }
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

/** Quick metadata toggles (visibility / forkable), owner only. */
export async function patchGameMeta(
  id: string,
  ownerId: string,
  fields: { visibility?: Visibility; forkable?: boolean },
): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: Date.now() }
  if (fields.visibility) set.visibility = fields.visibility
  if (typeof fields.forkable === 'boolean') set.forkable = fields.forkable
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
  return (rows as SummaryRow[]).map(toSummary)
}

/** Publicly listed games (visibility = public), most recent first. */
export async function listPublicGames(limit = 100): Promise<SavedGameSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(games)
    .where(eq(games.visibility, 'public'))
    .orderBy(desc(games.createdAt))
    .limit(limit)
  return (rows as SummaryRow[]).map(toSummary)
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
