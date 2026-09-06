import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIM_LEVELS, clampDim, dimLabel, loadDim, nextDim, saveDim } from './dim'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dim levels', () => {
  it('cycles through every level and wraps back to bright', () => {
    let l: number = DIM_LEVELS[0]
    const seen = [l]
    for (let i = 0; i < DIM_LEVELS.length; i++) {
      l = nextDim(l)
      seen.push(l)
    }
    expect(seen.slice(0, DIM_LEVELS.length)).toEqual([...DIM_LEVELS])
    expect(seen[seen.length - 1]).toBe(0) // wrapped
  })

  it('snaps junk to the nearest real level instead of trusting it', () => {
    expect(clampDim(0.3)).toBe(0.25)
    expect(clampDim(99)).toBe(0.65)
    expect(clampDim(Number.NaN)).toBe(0)
    expect(clampDim('dark')).toBe(0)
    expect(clampDim(undefined)).toBe(0)
  })

  it('labels every level, pairing the setting with words not just shade', () => {
    expect(DIM_LEVELS.map(dimLabel)).toEqual(['Bright', 'Dim', 'Dimmer', 'Darkest'])
  })
})

describe('dim persistence is storage-safe', () => {
  it('round-trips through localStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    saveDim(0.45)
    expect(loadDim()).toBe(0.45)
  })

  it('falls back to bright when storage THROWS, which is the blocked-frame case', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('access denied')
      },
      setItem: () => {
        throw new Error('access denied')
      },
    })
    // The play surface has to work where storage is blocked entirely.
    expect(() => saveDim(0.65)).not.toThrow()
    expect(loadDim()).toBe(0)
  })

  it('falls back to bright when there is no storage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadDim()).toBe(0)
    expect(() => saveDim(0.25)).not.toThrow()
  })

  it('ignores a corrupt stored value', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'wat', setItem: () => {} })
    expect(loadDim()).toBe(0)
  })
})
