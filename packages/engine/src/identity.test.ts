import { describe, expect, it } from 'vitest'
import {
  AVATAR_COLORS,
  ROOM_ALPHABET,
  avatarColor,
  fnv1a,
  initials,
  isValidRoomCode,
  makeRoomCode,
  playerId,
} from './identity'

describe('makeRoomCode', () => {
  it('produces a 4-char code from the unambiguous alphabet', () => {
    const code = makeRoomCode()
    expect(code).toHaveLength(4)
    for (const ch of code) expect(ROOM_ALPHABET).toContain(ch)
  })

  it('never contains ambiguous characters', () => {
    // Force every alphabet index across many draws.
    let i = 0
    const rand = () => (i++ % ROOM_ALPHABET.length) / ROOM_ALPHABET.length
    const code = makeRoomCode(rand, 64)
    expect(code).not.toMatch(/[IO01]/)
  })

  it('is deterministic given a seeded rand', () => {
    const rand = () => 0
    expect(makeRoomCode(rand)).toBe('AAAA')
  })

  it('respects a custom length', () => {
    expect(makeRoomCode(() => 0, 6)).toBe('AAAAAA')
  })
})

describe('isValidRoomCode', () => {
  it('accepts valid 4-char codes case-insensitively', () => {
    expect(isValidRoomCode('ABCD')).toBe(true)
    expect(isValidRoomCode('abcd')).toBe(true)
    expect(isValidRoomCode('K9XQ')).toBe(true)
  })

  it('rejects wrong length and ambiguous characters', () => {
    expect(isValidRoomCode('ABC')).toBe(false)
    expect(isValidRoomCode('ABCDE')).toBe(false)
    expect(isValidRoomCode('ABI1')).toBe(false)
    expect(isValidRoomCode('AB O')).toBe(false)
  })
})

describe('fnv1a', () => {
  it('is stable for the same input', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'))
  })

  it('differs for different inputs', () => {
    expect(fnv1a('hello')).not.toBe(fnv1a('world'))
  })
})

describe('playerId', () => {
  it('is stable and reclaimable for the same room+name', () => {
    expect(playerId('ABCD', 'Robin')).toBe(playerId('ABCD', 'Robin'))
  })

  it('is case- and whitespace-insensitive on the name', () => {
    expect(playerId('ABCD', '  Robin ')).toBe(playerId('ABCD', 'robin'))
  })

  it('differs across rooms and names', () => {
    expect(playerId('ABCD', 'Robin')).not.toBe(playerId('WXYZ', 'Robin'))
    expect(playerId('ABCD', 'Robin')).not.toBe(playerId('ABCD', 'Sam'))
  })

  it('is prefixed with p_', () => {
    expect(playerId('ABCD', 'Robin')).toMatch(/^p_/)
  })
})

describe('avatarColor', () => {
  it('is deterministic and from the palette', () => {
    const c = avatarColor('p_abc')
    expect(avatarColor('p_abc')).toBe(c)
    expect(AVATAR_COLORS).toContain(c)
  })
})

describe('initials', () => {
  it('takes up to two initials, uppercased', () => {
    expect(initials('robin banks')).toBe('RB')
    expect(initials('cher')).toBe('C')
    expect(initials('  ')).toBe('?')
    expect(initials('a b c')).toBe('AB')
  })
})
