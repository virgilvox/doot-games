import { describe, expect, it } from 'vitest'
import { addr, parseInputAddress, patterns, pidFromPlayerAddress, roomBase } from './addresses'

describe('address builders', () => {
  it('namespace everything under /doot/<ROOM>', () => {
    expect(roomBase('ABCD')).toBe('/doot/ABCD')
    expect(addr.phase('ABCD')).toBe('/doot/ABCD/phase')
    expect(addr.roundAnswer('ABCD', 3)).toBe('/doot/ABCD/round/3/answer')
    expect(addr.input('ABCD', 2, 'p_x')).toBe('/doot/ABCD/input/2/p_x')
    expect(addr.playerProfile('ABCD', 'p_x')).toBe('/doot/ABCD/player/p_x/profile')
    expect(addr.media('ABCD', '2/p_x')).toBe('/doot/ABCD/media/2/p_x')
  })

  it('builds wildcard patterns', () => {
    expect(patterns.allInputs('ABCD')).toBe('/doot/ABCD/input/*/*')
    expect(patterns.inputsForPlayer('ABCD', 'p_x')).toBe('/doot/ABCD/input/*/p_x')
    expect(patterns.playerProfile('ABCD')).toBe('/doot/ABCD/player/*/profile')
  })
})

describe('address parsing', () => {
  it('extracts a pid from a player address', () => {
    expect(pidFromPlayerAddress('/doot/ABCD/player/p_x/profile')).toBe('p_x')
    expect(pidFromPlayerAddress('/doot/ABCD/phase')).toBeNull()
  })

  it('round-trips an input address', () => {
    const built = addr.input('ABCD', 7, 'p_xyz')
    expect(parseInputAddress(built)).toEqual({ roundIndex: 7, pid: 'p_xyz' })
  })

  it('returns null for non-input addresses', () => {
    expect(parseInputAddress('/doot/ABCD/phase')).toBeNull()
    expect(parseInputAddress('/doot/ABCD/input/x/p_y')).toBeNull()
  })
})
