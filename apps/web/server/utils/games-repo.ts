/**
 * Saved-game persistence: validate at the boundary, then read/write the durable
 * store. Validation is shape + known-plugin only (deep per-round content is
 * validated client-side in the editor); a saved config carries no secrets — the
 * host derives answer keys from it at play time, never the server.
 */
import { isKnownPlugin } from '@doot-games/games/catalog'
import { z } from '@doot-games/sdk'
import { desc, eq } from 'drizzle-orm'
import { games, useDb } from './db'

const roundSchema = z.object({
  block: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
})

export const gameInputSchema = z.object({
  pluginId: z.string().min(1),
  themeId: z.string().min(1).max(40).optional(),
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
  config: { title: string; rounds: Array<{ block: string; content: Record<string, unknown> }> }
  createdAt: number
}

export interface SavedGameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  createdAt: number
}

function newId(): string {
  return `g_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export async function createGame(input: GameInput): Promise<{ id: string }> {
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
    config: JSON.stringify(input.config),
    createdAt: now,
    updatedAt: now,
  })
  return { id }
}

export async function listGames(limit = 100): Promise<SavedGameSummary[]> {
  const db = await useDb()
  const rows = await db
    .select({
      id: games.id,
      pluginId: games.pluginId,
      title: games.title,
      themeId: games.themeId,
      createdAt: games.createdAt,
    })
    .from(games)
    .orderBy(desc(games.createdAt))
    .limit(limit)
  return rows
}

export async function getGame(id: string): Promise<SavedGame | null> {
  const db = await useDb()
  const rows = await db.select().from(games).where(eq(games.id, id)).limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    pluginId: row.pluginId,
    title: row.title,
    themeId: row.themeId,
    config: JSON.parse(row.config),
    createdAt: row.createdAt,
  }
}
