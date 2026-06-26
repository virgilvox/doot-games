/**
 * Post-game content reports: the durable store behind the results-screen report
 * button and the admin Reports queue. Filing is anonymous (players have no account);
 * reading/triaging is admin-only (callers gate with `requireAdmin`).
 *
 * A report is a thin breadcrumb, never room state: by the time it is filed the room
 * is over, so we keep only what a moderator needs to find the offending game (its
 * title + type) and the room it happened in.
 */
import { z } from '@doot-games/sdk'
import { desc, eq, sql } from 'drizzle-orm'
import { REPORT_REASONS, type ReportReason, type ReportStatus, reports, useDb } from './db'

/** The validated shape of a filed report (the `/api/reports` POST boundary). A plain
 *  Zod object STRIPS unknown fields, so a malicious caller can't smuggle extra columns
 *  in. Lengths are capped here (and again defensively in createReport). */
export const reportInputSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(1000).optional(),
  roomCode: z.string().max(8).optional(),
  gameTitle: z.string().max(200).optional(),
  pluginId: z.string().max(80).optional(),
})

export type NewReport = z.infer<typeof reportInputSchema>

function newId(): string {
  return `rep_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

/** File a new report (status starts 'open'). Returns its id. */
export async function createReport(input: NewReport): Promise<{ id: string }> {
  const db = await useDb()
  const id = newId()
  await db.insert(reports).values({
    id,
    reason: input.reason,
    detail: input.detail?.trim()?.slice(0, 1000) || null,
    roomCode: input.roomCode?.trim()?.slice(0, 8) || null,
    gameTitle: input.gameTitle?.trim()?.slice(0, 200) || null,
    pluginId: input.pluginId?.trim()?.slice(0, 80) || null,
    status: 'open',
    createdAt: Date.now(),
    reviewedAt: null,
  })
  return { id }
}

export interface AdminReportRow {
  id: string
  reason: ReportReason
  detail: string | null
  roomCode: string | null
  gameTitle: string | null
  pluginId: string | null
  status: ReportStatus
  createdAt: number
  reviewedAt: number | null
}

/** List reports newest-first, optionally filtered to one status. */
export async function listReports(opts: { status?: ReportStatus; limit?: number } = {}): Promise<AdminReportRow[]> {
  const db = await useDb()
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500)
  const rows = await db
    .select()
    .from(reports)
    .where(opts.status ? eq(reports.status, opts.status) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason as ReportReason,
    detail: r.detail,
    roomCode: r.roomCode,
    gameTitle: r.gameTitle,
    pluginId: r.pluginId,
    status: r.status as ReportStatus,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
  }))
}

/** How many reports are still open (for the admin tab badge). */
export async function openReportCount(): Promise<number> {
  const db = await useDb()
  const row = (await db.get(
    sql`SELECT count(*) AS c FROM reports WHERE status = 'open'`,
  )) as { c: unknown } | undefined
  const c = row?.c
  return typeof c === 'number' ? c : Number(c ?? 0) || 0
}

/** Move a report to 'reviewed' or 'dismissed' (or back to 'open'). */
export async function setReportStatus(id: string, status: ReportStatus): Promise<boolean> {
  const db = await useDb()
  const res = await db
    .update(reports)
    .set({ status, reviewedAt: status === 'open' ? null : Date.now() })
    .where(eq(reports.id, id))
  return (res.rowsAffected ?? 0) > 0
}
