/**
 * Reusable content-deck persistence: the `/decks` library. A deck is a named-column
 * table of rows ("cards") that a game binds to (a `{ ref }`) or copies in as a
 * snapshot. Decks are owned and have a visibility — `private` / `unlisted` / `public`
 * — exactly like games.
 *
 * Answer-hiding is NOT a deck concern: a library deck has no round context, so no
 * column is "an answer" until a *game* binds it to an answer field. That redaction
 * stays in the game serve path (`redactDecks`); the library stores full data.
 */
import { z } from '@doot-games/sdk'
import { and, desc, eq } from 'drizzle-orm'
import { type Visibility, decks, useDb } from './db'
import { authorsFor } from './users'

/** Deck descriptor hints. `generic` = arbitrary columns; the typed kinds pre-seed a
 *  known column shape and advertise which mode-2 pools they satisfy. */
export const DECK_KINDS = ['generic', 'quiz', 'prompt', 'card'] as const
export type DeckKind = (typeof DECK_KINDS)[number]

const deckColumnSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().max(80).default(''),
  type: z.enum(['text', 'image', 'number']),
})

export const deckInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
  kind: z.enum(DECK_KINDS).optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
  remixable: z.boolean().optional(),
  columns: z.array(deckColumnSchema).min(1).max(50),
  rows: z.array(z.record(z.string().max(64), z.union([z.string().max(2000), z.number(), z.null()]))).max(1000),
})
export type DeckInput = z.infer<typeof deckInputSchema>

export type DeckColumn = { key: string; label: string; type: 'text' | 'image' | 'number' }
export type DeckRow = Record<string, string | number | null>

export interface SavedDeck {
  id: string
  ownerId: string | null
  name: string
  description: string | null
  kind: DeckKind
  visibility: Visibility
  remixable: boolean
  columns: DeckColumn[]
  rows: DeckRow[]
  createdAt: number
  updatedAt: number
}

export interface SavedDeckSummary {
  id: string
  name: string
  description: string | null
  kind: DeckKind
  visibility: Visibility
  remixable: boolean
  columnCount: number
  rowCount: number
  /** The author's display name (never their email), or null. */
  authorName: string | null
  /** The author's claimed @handle (lowercase), or null. */
  authorHandle: string | null
  createdAt: number
}

function newId(): string {
  return `lib_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

// A deck of text/URL rows is small (images are URLs, not bytes). Cap the serialized
// size so one user can't store a multi-MB blob (mirrors the game config cap).
const MAX_DECK_BYTES = 2_000_000
function serializeRows(rows: DeckRow[]): string {
  const s = JSON.stringify(rows)
  if (s.length > MAX_DECK_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'This deck is too large to save.' })
  }
  return s
}

function rowFrom(row: { columns: string; rows: string }): { columns: DeckColumn[]; rows: DeckRow[] } {
  try {
    return { columns: JSON.parse(row.columns), rows: JSON.parse(row.rows) }
  } catch {
    return { columns: [], rows: [] }
  }
}

export async function createDeck(input: DeckInput, ownerId: string): Promise<{ id: string }> {
  const db = await useDb()
  const now = Date.now()
  const id = newId()
  await db.insert(decks).values({
    id,
    ownerId,
    name: input.name,
    description: input.description?.length ? input.description : null,
    kind: input.kind ?? 'generic',
    visibility: input.visibility ?? 'private',
    remixable: input.remixable ?? false,
    columns: JSON.stringify(input.columns),
    rows: serializeRows(input.rows as DeckRow[]),
    createdAt: now,
    updatedAt: now,
  })
  return { id }
}

/** Full update of a deck, owner only. An omitted metadata field is left as-is; an
 *  explicit empty value clears it (matches updateGame). Returns false if no such
 *  deck is owned by the user. */
export async function updateDeck(id: string, ownerId: string, input: DeckInput): Promise<boolean> {
  const set: Record<string, unknown> = {
    name: input.name,
    columns: JSON.stringify(input.columns),
    rows: serializeRows(input.rows as DeckRow[]),
    updatedAt: Date.now(),
  }
  if (input.kind !== undefined) set.kind = input.kind
  if (input.visibility !== undefined) set.visibility = input.visibility
  if (input.remixable !== undefined) set.remixable = input.remixable
  if (input.description !== undefined) set.description = input.description.length ? input.description : null
  const db = await useDb()
  const res = await db.update(decks).set(set).where(and(eq(decks.id, id), eq(decks.ownerId, ownerId)))
  return (res.rowsAffected ?? 0) > 0
}

/** Delete a deck, owner only. Returns true if a row was deleted. */
export async function deleteDeck(id: string, ownerId: string): Promise<boolean> {
  const db = await useDb()
  const res = await db.delete(decks).where(and(eq(decks.id, id), eq(decks.ownerId, ownerId)))
  return (res.rowsAffected ?? 0) > 0
}

/**
 * Fetch a deck by id, enforcing visibility: `private` decks return only to their
 * owner; `unlisted`/`public` are open to anyone with the link. A hidden deck reads
 * as not-found so its existence doesn't leak.
 */
export async function getDeck(id: string, requesterId: string | null): Promise<SavedDeck | null> {
  const db = await useDb()
  const rows = await db.select().from(decks).where(eq(decks.id, id)).limit(1)
  const row = rows[0]
  if (!row) return null
  const visibility = row.visibility as Visibility
  if (visibility === 'private' && (!row.ownerId || row.ownerId !== requesterId)) return null
  const { columns, rows: deckRows } = rowFrom(row)
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    kind: row.kind as DeckKind,
    visibility,
    remixable: row.remixable,
    columns,
    rows: deckRows,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Load decks for serve-time reference resolution in a game. A game may inline a deck
 * it OWNS (even private — embedding it in the game is the owner's choice) or any
 * `unlisted`/`public` deck. A stranger's `private` deck is never resolved, so a game
 * can't be used to exfiltrate a deck the game owner can't see. Returns id → {columns,
 * rows}; ids it may not read are simply absent (the resolver is missing-safe).
 */
export async function loadDecksForServe(
  ids: string[],
  gameOwnerId: string | null,
): Promise<Record<string, { columns: DeckColumn[]; rows: DeckRow[] }>> {
  const unique = [...new Set(ids)].filter((s) => s.startsWith('lib_'))
  if (unique.length === 0) return {}
  const db = await useDb()
  const out: Record<string, { columns: DeckColumn[]; rows: DeckRow[] }> = {}
  // One row at a time keeps this simple and bounded (a game references few decks).
  for (const id of unique) {
    const r = (await db.select().from(decks).where(eq(decks.id, id)).limit(1))[0]
    if (!r) continue
    const ownedByGame = !!r.ownerId && r.ownerId === gameOwnerId
    if (r.visibility === 'private' && !ownedByGame) continue
    out[id] = rowFrom(r)
  }
  return out
}

const SUMMARY_COLUMNS = {
  id: decks.id,
  ownerId: decks.ownerId,
  name: decks.name,
  description: decks.description,
  kind: decks.kind,
  visibility: decks.visibility,
  remixable: decks.remixable,
  columns: decks.columns,
  rows: decks.rows,
  createdAt: decks.createdAt,
}
interface SummaryRow {
  id: string
  ownerId: string | null
  name: string
  description: string | null
  kind: string
  visibility: string
  remixable: boolean
  columns: string
  rows: string
  createdAt: number
}

/** Count rows/columns from the stored JSON without materializing the cells. */
function countOf(json: string): number {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.length : 0
  } catch {
    return 0
  }
}

async function toSummaries(rows: SummaryRow[]): Promise<SavedDeckSummary[]> {
  const authors = await authorsFor(rows.map((r) => r.ownerId ?? ''))
  return rows.map((r) => {
    const author = r.ownerId ? authors.get(r.ownerId) : undefined
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      kind: r.kind as DeckKind,
      visibility: r.visibility as Visibility,
      remixable: r.remixable,
      columnCount: countOf(r.columns),
      rowCount: countOf(r.rows),
      authorName: author?.handle ? null : (author?.name ?? null),
      authorHandle: author?.handle ?? null,
      createdAt: r.createdAt,
    }
  })
}

/** The current user's decks (any visibility), most recent first. */
export async function listMyDecks(ownerId: string, limit = 200): Promise<SavedDeckSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(decks)
    .where(eq(decks.ownerId, ownerId))
    .orderBy(desc(decks.createdAt))
    .limit(limit)
  return toSummaries(rows as SummaryRow[])
}

/** Publicly listed decks (visibility = public), most recent first. */
export async function listPublicDecks(limit = 200): Promise<SavedDeckSummary[]> {
  const db = await useDb()
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(decks)
    .where(eq(decks.visibility, 'public'))
    .orderBy(desc(decks.createdAt))
    .limit(limit)
  return toSummaries(rows as SummaryRow[])
}

/**
 * Copy a deck into a new one owned by the requester. You can copy your own deck, or
 * any deck marked `remixable` that you're allowed to see. The copy starts `private`
 * and non-remixable until its new owner opts in.
 */
export async function cloneDeck(id: string, requesterId: string): Promise<{ id: string }> {
  const db = await useDb()
  const row = (await db.select().from(decks).where(eq(decks.id, id)).limit(1))[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
  const visibility = row.visibility as Visibility
  const isOwner = !!row.ownerId && row.ownerId === requesterId
  const viewable = isOwner || visibility !== 'private'
  if (!viewable || (!isOwner && !row.remixable)) {
    throw createError({ statusCode: 403, statusMessage: 'This deck cannot be copied.' })
  }
  const now = Date.now()
  const newDeckId = newId()
  await db.insert(decks).values({
    id: newDeckId,
    ownerId: requesterId,
    name: `${row.name} (copy)`,
    description: row.description,
    kind: row.kind,
    visibility: 'private',
    remixable: false,
    columns: row.columns,
    rows: row.rows,
    createdAt: now,
    updatedAt: now,
  })
  return { id: newDeckId }
}
