/**
 * Saved-game persistence: validate at the boundary, then read/write the durable
 * store. Validation is shape + known-plugin only (deep per-round content is
 * validated client-side in the editor); a saved config carries no secrets — the
 * host derives answer keys from it at play time, never the server.
 *
 * Games are owned and have a visibility: `private` (owner only), `unlisted`
 * (anyone with the link), or `public` (also listed for discovery).
 */
import { isKnownPlugin } from '@doot-games/games/catalog'
import { z } from '@doot-games/sdk'
import { desc, eq } from 'drizzle-orm'
import { type Visibility, games, useDb } from './db'

const roundSchema = z.object({
  block: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
})

export const gameInputSchema = z.object({
  pluginId: z.string().min(1),
  themeId: z.string().min(1).max(40).optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
  config: z.object({
    title: z.string().trim().min(1).max(120),
    rounds: z.array(roundSchema).min(1).max(50),
  }),
})

export type GameInput = z.infer<typeof gameInputSchema>

export interface SavedGame {
  id: string
  pluginId: string
  title: string
  themeId: string
  ownerId: string | null
  visibility: Visibility
  config: { title: string; rounds: Array<{ block: string; content: Record<string, unknown> }> }
  createdAt: number
}

export interface SavedGameSummary {
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
    themeId: input.themeId ?? 'doot',
    ownerId,
    visibility: input.visibility ?? 'private',
    config: JSON.stringify(input.config),
    createdAt: now,
    updatedAt: now,
  })
  return { id }
}

/** The current user's games (any visibility), most recent first. */
export async function listMyGames(ownerId: string, limit = 100): Promise<SavedGameSummary[]> {
  const db = await useDb()
  return db
    .select({
      id: games.id,
      pluginId: games.pluginId,
      title: games.title,
      themeId: games.themeId,
      visibility: games.visibility,
      createdAt: games.createdAt,
    })
    .from(games)
    .where(eq(games.ownerId, ownerId))
    .orderBy(desc(games.createdAt))
    .limit(limit) as Promise<SavedGameSummary[]>
}

/** Publicly listed games (visibility = public), most recent first. */
export async function listPublicGames(limit = 100): Promise<SavedGameSummary[]> {
  const db = await useDb()
  return db
    .select({
      id: games.id,
      pluginId: games.pluginId,
      title: games.title,
      themeId: games.themeId,
      visibility: games.visibility,
      createdAt: games.createdAt,
    })
    .from(games)
    .where(eq(games.visibility, 'public'))
    .orderBy(desc(games.createdAt))
    .limit(limit) as Promise<SavedGameSummary[]>
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
  if (visibility === 'private' && row.ownerId !== requesterId) return null
  return {
    id: row.id,
    pluginId: row.pluginId,
    title: row.title,
    themeId: row.themeId,
    ownerId: row.ownerId,
    visibility,
    config: JSON.parse(row.config),
    createdAt: row.createdAt,
  }
}
