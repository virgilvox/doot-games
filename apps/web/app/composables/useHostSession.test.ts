import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistHostRoom, resetHostSession, useHostSession } from './useHostSession'

// A minimal sessionStorage stand-in (the composable only uses get/set/removeItem).
function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
  } as Storage
}

const HOUR = 60 * 60 * 1000

describe('useHostSession', () => {
  let now = 1_000_000

  beforeEach(() => {
    now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    Object.defineProperty(globalThis, 'sessionStorage', { value: fakeStorage(), configurable: true })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mints a fresh code + token on first host, and persists them', () => {
    const a = useHostSession({ context: 'g:1' })
    expect(a.room).toMatch(/^[A-Z2-9]{4}$/) // 4-char unambiguous code
    expect(a.token).toBeTruthy()
    expect(sessionStorage.getItem('doot-host-room')).toBe(a.room)
    expect(sessionStorage.getItem('doot-host-ctx')).toBe('g:1')
  })

  it('RESUMES the same room on a refresh of the same context (players stay)', () => {
    const a = useHostSession({ context: 'g:1' })
    now += 30_000 // a quick reload
    const b = useHostSession({ context: 'g:1' })
    expect(b.room).toBe(a.room)
    expect(b.token).toBe(a.token)
  })

  it('CYCLES the code when a different game is hosted in the same tab', () => {
    const a = useHostSession({ context: 'g:1' })
    const b = useHostSession({ context: 'g:2' }) // a new game
    expect(b.room).not.toBe(a.room)
    expect(b.token).not.toBe(a.token)
    expect(sessionStorage.getItem('doot-host-ctx')).toBe('g:2')
  })

  it('CYCLES the code when the tab has been idle past the window', () => {
    const a = useHostSession({ context: 'g:1' })
    now += 7 * HOUR // reopened the next day
    const b = useHostSession({ context: 'g:1' })
    expect(b.room).not.toBe(a.room)
  })

  it('keeps resuming as long as the host stays active (idle clock is bumped each load)', () => {
    const a = useHostSession({ context: 'g:1' })
    for (let i = 0; i < 10; i++) {
      now += 5 * HOUR // active, just under the 6h window each time
      const b = useHostSession({ context: 'g:1' })
      expect(b.room).toBe(a.room)
    }
  })

  it('resetHostSession() forces a brand-new room on the next mount', () => {
    const a = useHostSession({ context: 'g:1' })
    resetHostSession()
    const b = useHostSession({ context: 'g:1' })
    expect(b.room).not.toBe(a.room)
    expect(b.token).not.toBe(a.token)
  })

  it('persistHostRoom updates the stored code (engine collision regen)', () => {
    useHostSession({ context: 'g:1' })
    persistHostRoom('ZZZZ')
    expect(sessionStorage.getItem('doot-host-room')).toBe('ZZZZ')
    now += 30_000
    expect(useHostSession({ context: 'g:1' }).room).toBe('ZZZZ') // the regenerated code is resumed
  })
})
