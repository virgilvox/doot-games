import { describe, expect, it } from 'vitest'
import { reportInputSchema } from './reports-repo'

// The `/api/reports` POST boundary validates with `reportInputSchema`. A plain Zod
// object STRIPS unknown fields, so a caller can't smuggle extra columns (e.g. a forged
// `status`) into the store.
describe('reportInputSchema', () => {
  it('accepts a minimal report (reason only)', () => {
    const r = reportInputSchema.safeParse({ reason: 'offensive' })
    expect(r.success).toBe(true)
  })

  it('accepts the full set of context fields', () => {
    const r = reportInputSchema.parse({
      reason: 'harassment',
      detail: 'a player kept harassing the room',
      roomCode: 'AB3K',
      gameTitle: 'Quip Clash',
      pluginId: 'quip-clash',
    })
    expect(r.reason).toBe('harassment')
    expect(r.roomCode).toBe('AB3K')
  })

  it('rejects an unknown reason', () => {
    expect(reportInputSchema.safeParse({ reason: 'because' }).success).toBe(false)
  })

  it('rejects a missing reason', () => {
    expect(reportInputSchema.safeParse({ detail: 'no reason given' }).success).toBe(false)
  })

  it('rejects over-long detail (the size cap)', () => {
    expect(reportInputSchema.safeParse({ reason: 'spam', detail: 'x'.repeat(1001) }).success).toBe(false)
  })

  it('strips unknown fields so a forged status cannot reach the store', () => {
    const parsed = reportInputSchema.parse({ reason: 'other', status: 'reviewed', id: 'rep_hack' } as Record<string, unknown>)
    expect('status' in parsed).toBe(false)
    expect('id' in parsed).toBe(false)
  })
})
