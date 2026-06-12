import { describe, expect, it } from 'vitest'
import {
  ANALOG_FULL,
  CONSOLES,
  aliasToTouch,
  analogToEmu,
  axisToDirections,
  consoleSpec,
  detectConsole,
  emuIndexFor,
  gameNameOf,
  nextFreeSeat,
  shareLink,
} from './logic'

describe('detectConsole', () => {
  it('maps known extensions, case- and query-insensitive', () => {
    expect(detectConsole('mario.nes')).toBe('nes')
    expect(detectConsole('zelda.Z64')).toBe('n64')
    expect(detectConsole('https://x.com/a/Game.gba?token=1')).toBe('gba')
    expect(detectConsole('disc.cue')).toBe('psx')
  })
  it('returns null for unknown extensions', () => {
    expect(detectConsole('notes.txt')).toBeNull()
    expect(detectConsole('noext')).toBeNull()
  })
})

describe('gameNameOf', () => {
  it('strips path + extension', () => {
    expect(gameNameOf('https://x.com/roms/Super Mario.nes')).toBe('Super Mario')
    expect(gameNameOf('game.sfc')).toBe('game')
  })
})

describe('consoleSpec', () => {
  it('resolves known and falls back to nes', () => {
    expect(consoleSpec('snes').core).toBe('snes')
    expect(consoleSpec('nope').key).toBe('nes')
    expect(consoleSpec(null).key).toBe('nes')
  })
})

describe('nextFreeSeat', () => {
  it('finds the first empty seat, or -1 when full', () => {
    expect(nextFreeSeat([null, null], 2)).toBe(0)
    expect(nextFreeSeat(['a', null], 2)).toBe(1)
    expect(nextFreeSeat(['a', 'b'], 2)).toBe(-1)
    // A gamepad in seat 0 and a phone joining takes seat 1.
    expect(nextFreeSeat(['gamepad', null, null, null], 4)).toBe(1)
  })
})

describe('shareLink', () => {
  it('builds a deep link into a rom + console', () => {
    const link = shareLink('https://doot.games', 'https://x.com/a.nes', 'nes')
    expect(link).toContain('/host/retro-arcade')
    expect(link).toContain(`rom=${encodeURIComponent('https://x.com/a.nes')}`)
    expect(link).toContain('core=nes')
  })
})

describe('axisToDirections', () => {
  it('reads a screen-up-positive sample (up = +y)', () => {
    expect(axisToDirections(0, 1)).toMatchObject({ up: true, down: false })
    expect(axisToDirections(0, -1)).toMatchObject({ down: true, up: false })
    expect(axisToDirections(-1, 0)).toMatchObject({ left: true, right: false })
    expect(axisToDirections(0, 0)).toEqual({ up: false, down: false, left: false, right: false })
  })
})

describe('analogToEmu', () => {
  it('splits a sample into the four signed full-scale indices for a base', () => {
    // right + up at half deflection, left stick (base 16)
    const out = analogToEmu(0.5, 0.5, 16)
    expect(out).toEqual([
      [16, Math.round(ANALOG_FULL * 0.5)], // right
      [17, 0], // left
      [18, 0], // down (y<0)
      [19, Math.round(ANALOG_FULL * 0.5)], // up (y>0)
    ])
  })
  it('uses the right-stick base 20', () => {
    expect(analogToEmu(-1, 0, 20)).toEqual([
      [20, 0],
      [21, ANALOG_FULL],
      [22, 0],
      [23, 0],
    ])
  })
})

describe('aliasToTouch / emuIndexFor', () => {
  it('maps a gamepad position id to a console touch id, then to an emu index', () => {
    const n64 = CONSOLES.n64!
    // A physical trigger (LT = position l2) is N64 Z, emu index 12.
    expect(aliasToTouch(n64, 'l2')).toBe('z')
    expect(emuIndexFor(n64, 'z')).toBe(12)
    // PlayStation: gamepad north (y) is triangle, emu 9.
    const psx = CONSOLES.psx!
    expect(aliasToTouch(psx, 'y')).toBe('triangle')
    expect(emuIndexFor(psx, 'triangle')).toBe(9)
  })
  it('returns null for an unmapped id', () => {
    expect(aliasToTouch(CONSOLES.nes!, 'x')).toBeNull() // NES has no X
    expect(emuIndexFor(CONSOLES.nes!, 'x')).toBeNull()
  })
})

describe('console table integrity', () => {
  it('every padAlias target is a real touch id on that console', () => {
    for (const spec of Object.values(CONSOLES)) {
      for (const touchId of Object.values(spec.padAlias)) {
        expect(
          spec.touchIndex[touchId],
          `${spec.key}: alias -> ${touchId} missing from touchIndex`,
        ).toBeTypeOf('number')
      }
    }
  })
  it('every console maps the four directions', () => {
    for (const spec of Object.values(CONSOLES)) {
      for (const dir of ['up', 'down', 'left', 'right']) {
        expect(spec.touchIndex[dir], `${spec.key} missing ${dir}`).toBeTypeOf('number')
      }
    }
  })
})
