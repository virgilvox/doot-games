/**
 * Session-lineup ("playlist") persistence: a saved, ordered list of game ids played
 * back to back in one room (a "night of games"). Owned and visibility'd exactly like
 * games and decks. Nothing about a live session is stored here, only the durable
 * lineup. Mirrors decks-repo.
 */
import { z } from '@doot-games/sdk'
import { isKnownPlugin } from '@doot-games/games/catalog'
import { and, desc, eq } from 'drizzle-orm'
import { type Visibility, playlists, useDb } from './db'
import { authorsFor } from './users'

export const playlistInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
  /** Ordered game ids; only known first-party games, 2-20 of them. */
  games: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(20)
    .refine((ids) => ids.every((id) => isKnownPlugin(id)), { message: 'Unknown game in the lineup.' }),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
  remixable: z.boolean().optional(),
})
export type PlaylistInput = z.infer<typeof playlistInputSchema>

export interface SavedPlaylist {
  id: string
  ownerId: string | null
  name: string
  description: string | null
  games: string[]
  visibility: Visibility
  remixable: boolean
  createdAt: number
  updatedAt: number
}

export interface SavedPlaylistSummary {
  id: string
  name: string
  description: string | null
  games: string[]
  gameCount: number
  visibility: Visibility
  remixable: boolean
  authorName: string | null
  authorHandle: string | null
  createdAt: number
}

function newId(): string {
  return `pl_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

function gamesFrom(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((g): g is string => typeof g === 'string') : []
  } catch {
    return []
  }
}

export async function createPlaylist(input: PlaylistInput, ownerId: string): Promise<{ id: string }> {
  const db = await useDb()
  const now = Date.now()
  const id = newId()
  await db.insert(playlists).values({
    id,
    ownerId,
    name: input.name,
    description: input.description?.length ? input.description : null,
    games: JSON.stringify(input.games),
    visibility: input.visibility ?? 'private',
    remixable: input.remixable ?? false,
    createdAt: now,
    updatedAt: now,
  })
  return { id }
}

/** Full update, owner only. Omitted metadata is left as-is; an explicit empty value
 *  clears it (matches updateDeck). Returns false if no such playlist is owned. */
export async function updatePlaylist(id: string, ownerId: string, input: PlaylistInput): Promise<boolean> {
  const set: Record<string, unknown> = {
    name: input.name,
    games: JSON.stringify(input.games),
    updatedAt: Date.now(),
  }
  if (input.visibility !== undefined) set.visibility = input.visibility
  if (input.remixable !== undefined) set.remixable = input.remixable
  if (input.description !== undefined) set.description = input.description.length ? input.description : null
  const db = await useDb()
  const res = await db.update(playlists).set(set).where(and(eq(playlists.id, id), eq(playlists.ownerId, ownerId)))
  return (res.rowsAffected ?? 0) > 0
}

/** Delete a playlist, owner only. */
export async function deletePlaylist(id: string, ownerId: string): Promise<boolean> {
  const db = await useDb()
  const res = await db.delete(playlists).where(and(eq(playlists.id, id), eq(playlists.ownerId, ownerId)))
  return (res.rowsAffected ?? 0) > 0
}

/**
 * Fetch a playlist by id, enforcing visibility: a `private` playlist returns only to
 * its owner; `unlisted`/`public` are open to anyone with the link (so a host can run
 * an unlisted lineup without logging in). A hidden one reads as not-found.
 */
export async function getPlaylist(id: string, requesterId: string | null): Promise<SavedPlaylist | null> {
  const db = await useDb()
  const row = (await db.select().from(playlists).where(eq(playlists.id, id)).limit(1))[0]
  if (!row) return null
  const visibility = row.visibility as Visibility
  if (visibility === 'private' && (!row.ownerId || row.ownerId !== requesterId)) return null
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    games: gamesFrom(row.games),
    visibility,
    remixable: row.remixable,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const SUMMARY_COLUMNS = {
  id: playlists.id,
  ownerId: playlists.ownerId,
  name: playlists.name,
  description: playlists.description,
  games: playlists.games,
  visibility: playlists.visibility,
  remixable: playlists.remixable,
  createdAt: playlists.createdAt,
}
interface SummaryRow {
  id: string
  ownerId: string | null
  name: string
  description: string | null
  games: string
  visibility: string
  remixable: boolean
  createdAt: number
}

async function toSummaries(rows: SummaryRow[]): Promise<SavedPlaylistSummary[]> {
  const authors = await authorsFor(rows.map((r) => r.ownerId ?? ''))
  return rows.map((r) => {
    const author = r.ownerId ? authors.get(r.ownerId) : undefined
    const games = gamesFrom(r.games)
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      games,
      gameCount: games.length,
      visibility: r.visibility as Visibility,
      remixable: r.remixable,
      authorName: author?.handle ? null : (author?.name ?? null),
      authorHandle: author?.handle ?? null,
      createdAt: r.createdAt,
    }
  })
}

/** The current user's playlists (any visibility), most recent first. */
export async function listMyPlaylists(ownerId: string, limit = 200): Promise<SavedPlaylistSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(playlists)
    .where(eq(playlists.ownerId, ownerId))
    .orderBy(desc(playlists.createdAt))
    .limit(limit)
  return toSummaries(rows as SummaryRow[])
}

/** Publicly listed playlists, most recent first. */
export async function listPublicPlaylists(limit = 200): Promise<SavedPlaylistSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(playlists)
    .where(eq(playlists.visibility, 'public'))
    .orderBy(desc(playlists.createdAt))
    .limit(limit)
  return toSummaries(rows as SummaryRow[])
}
