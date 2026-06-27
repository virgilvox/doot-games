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

  const stored = (ctx: string) => JSON.parse(sessionStorage.getItem('doot-host-rooms') ?? '{}')[ctx]

  it('mints a fresh code + token on first host, and persists them under the context', () => {
    const a = useHostSession({ context: 'g:1' })
    expect(a.room).toMatch(/^[A-Z2-9]{4}$/) // 4-char unambiguous code
    expect(a.token).toBeTruthy()
    expect(stored('g:1').room).toBe(a.room)
    expect(stored('g:1').token).toBe(a.token)
  })

  it('RESUMES the same room on a refresh of the same context (players stay)', () => {
    const a = useHostSession({ context: 'g:1' })
    now += 30_000 // a quick reload
    const b = useHostSession({ context: 'g:1' })
    expect(b.room).toBe(a.room)
    expect(b.token).toBe(a.token)
  })

  it('gives a DIFFERENT game its own room (a new game never inherits the old code)', () => {
    const a = useHostSession({ context: 'g:1' })
    const b = useHostSession({ context: 'g:2' }) // a new game
    expect(b.room).not.toBe(a.room)
    expect(b.token).not.toBe(a.token)
  })

  it('keeps EACH game its own room when alternating (detour-and-return does not strand it)', () => {
    const a = useHostSession({ context: 'g:1' })
    const b = useHostSession({ context: 'g:2' }) // detour to another game
    now += 30_000
    const backToA = useHostSession({ context: 'g:1' }) // return to the first game
    expect(backToA.room).toBe(a.room) // resumed, not re-minted
    expect(backToA.token).toBe(a.token)
    // and g:2's room is still independently held
    expect(useHostSession({ context: 'g:2' }).room).toBe(b.room)
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

  it('resetHostSession(context) forces a brand-new room for that game, leaving others', () => {
    const a = useHostSession({ context: 'g:1' })
    const other = useHostSession({ context: 'g:2' })
    resetHostSession('g:1')
    const b = useHostSession({ context: 'g:1' })
    expect(b.room).not.toBe(a.room)
    expect(b.token).not.toBe(a.token)
    expect(useHostSession({ context: 'g:2' }).room).toBe(other.room) // untouched
  })

  it('resetHostSession() with no arg forgets every room in the tab', () => {
    const a = useHostSession({ context: 'g:1' })
    const b = useHostSession({ context: 'g:2' })
    resetHostSession()
    expect(useHostSession({ context: 'g:1' }).room).not.toBe(a.room)
    expect(useHostSession({ context: 'g:2' }).room).not.toBe(b.room)
  })

  it('persistHostRoom(context, code) updates only that context (engine collision regen)', () => {
    useHostSession({ context: 'g:1' })
    const other = useHostSession({ context: 'g:2' })
    persistHostRoom('g:1', 'ZZZZ')
    expect(stored('g:1').room).toBe('ZZZZ')
    expect(stored('g:2').room).toBe(other.room) // unaffected
    now += 30_000
    expect(useHostSession({ context: 'g:1' }).room).toBe('ZZZZ') // the regenerated code is resumed
  })
})
