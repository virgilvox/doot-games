import { describe, expect, it } from 'vitest'
import { buildResetUrl, ResetThrottle, resetEmail } from './password-reset'

describe('buildResetUrl', () => {
  it('puts the token in the fragment, never the query string', () => {
    const url = buildResetUrl('https://doot.games', 'abc123')
    expect(url).toBe('https://doot.games/reset-password#token=abc123')
    expect(new URL(url).search).toBe('')
  })

  it('tolerates a trailing slash and encodes the token', () => {
    expect(buildResetUrl('https://doot.games/', 'a b/c')).toBe('https://doot.games/reset-password#token=a%20b%2Fc')
  })
})

describe('resetEmail', () => {
  it('includes the link in both parts and escapes it in HTML', () => {
    const url = 'https://doot.games/reset-password#token=x"><script>'
    const m = resetEmail('a@b.co', url)
    expect(m.to).toBe('a@b.co')
    expect(m.text).toContain(url)
    expect(m.html).not.toContain('"><script>')
    expect(m.html).toContain('&quot;&gt;&lt;script&gt;')
  })
})

describe('ResetThrottle', () => {
  it('enforces a cooldown per address, case-insensitively', () => {
    const t = new ResetThrottle(60_000, 5)
    expect(t.allow('A@x.co', 0)).toBe(true)
    expect(t.allow('a@x.co', 30_000)).toBe(false)
    expect(t.allow('other@x.co', 30_000)).toBe(true)
    expect(t.allow('a@x.co', 61_000)).toBe(true)
  })

  it('caps sends per hour, then recovers', () => {
    const t = new ResetThrottle(0, 3)
    expect([0, 1, 2, 3].map((m) => t.allow('a@x.co', m * 60_000))).toEqual([true, true, true, false])
    expect(t.allow('a@x.co', 3_600_001)).toBe(true)
  })
})
