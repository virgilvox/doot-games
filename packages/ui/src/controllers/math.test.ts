import { describe, expect, it } from 'vitest'
import {
  type GamepadMapping,
  clampStick,
  deadzone,
  dpadDirections,
  foldGamepad,
  sliderPct,
  sliderValueFromPointer,
  stickSample,
} from './math'

describe('dpadDirections', () => {
  it('is dead at the center', () => {
    expect(dpadDirections(0, 0, 0.28)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    })
  })
  it('reads a single axis past the threshold', () => {
    expect(dpadDirections(0, -0.5, 0.28)).toMatchObject({ up: true, down: false })
    expect(dpadDirections(0, 0.5, 0.28)).toMatchObject({ down: true, up: false })
    expect(dpadDirections(-0.5, 0, 0.28)).toMatchObject({ left: true, right: false })
    expect(dpadDirections(0.5, 0, 0.28)).toMatchObject({ right: true, left: false })
  })
  it('allows diagonals by default', () => {
    expect(dpadDirections(0.5, -0.5, 0.28)).toEqual({
      up: true,
      down: false,
      left: false,
      right: true,
    })
  })
  it('snaps to the dominant axis when diagonals are off', () => {
    // horizontal stronger -> only right
    expect(dpadDirections(0.6, -0.4, 0.28, false)).toEqual({
      up: false,
      down: false,
      left: false,
      right: true,
    })
    // vertical stronger -> only up
    expect(dpadDirections(0.3, -0.7, 0.28, false)).toEqual({
      up: true,
      down: false,
      left: false,
      right: false,
    })
  })
  it('treats exactly-threshold as inactive (strict >)', () => {
    expect(dpadDirections(0.28, 0, 0.28)).toMatchObject({ right: false, left: false })
  })
})

describe('clampStick', () => {
  it('leaves vectors inside the unit circle unchanged', () => {
    expect(clampStick(0.3, -0.4)).toEqual({ x: 0.3, y: -0.4 })
  })
  it('clamps an out-of-circle vector to magnitude 1', () => {
    const c = clampStick(3, 4) // magnitude 5 -> (0.6, 0.8)
    expect(c.x).toBeCloseTo(0.6, 6)
    expect(c.y).toBeCloseTo(0.8, 6)
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(1, 6)
  })
  it('keeps the origin at zero', () => {
    expect(clampStick(0, 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('deadzone', () => {
  it('zeroes values inside the band', () => {
    expect(deadzone(0.05, 0.08)).toBe(0)
    expect(deadzone(-0.05, 0.08)).toBe(0)
  })
  it('passes values outside the band through', () => {
    expect(deadzone(0.5, 0.08)).toBe(0.5)
    expect(deadzone(-0.5, 0.08)).toBe(-0.5)
  })
  it('keeps a value exactly at the band edge (strict <)', () => {
    expect(deadzone(0.08, 0.08)).toBe(0.08)
  })
})

describe('stickSample', () => {
  it('flips y so up is positive and applies a per-axis deadzone', () => {
    // pointer dy positive = down -> logical y negative
    expect(stickSample(0.5, 0.5, 0.08)).toEqual({ x: 0.5, y: -0.5 })
    expect(stickSample(0.5, -0.5, 0.08)).toEqual({ x: 0.5, y: 0.5 })
  })
  it('deadzones each axis independently', () => {
    expect(stickSample(0.04, 0.5, 0.08)).toEqual({ x: 0, y: -0.5 })
  })
})

describe('sliderPct', () => {
  it('maps endpoints and midpoint', () => {
    expect(sliderPct(0, 0, 100)).toBe(0)
    expect(sliderPct(100, 0, 100)).toBe(1)
    expect(sliderPct(50, 0, 100)).toBe(0.5)
  })
  it('clamps out-of-range and avoids NaN when min==max', () => {
    expect(sliderPct(-10, 0, 100)).toBe(0)
    expect(sliderPct(200, 0, 100)).toBe(1)
    expect(sliderPct(5, 5, 5)).toBe(0)
  })
})

describe('sliderValueFromPointer', () => {
  const base = { trackStart: 100, trackLength: 200, min: 0, max: 100 }
  it('maps a horizontal track left->right', () => {
    expect(sliderValueFromPointer({ ...base, clientPos: 100, axis: 'x' })).toBe(0)
    expect(sliderValueFromPointer({ ...base, clientPos: 300, axis: 'x' })).toBe(100)
    expect(sliderValueFromPointer({ ...base, clientPos: 200, axis: 'x' })).toBe(50)
  })
  it('inverts a vertical track bottom->top', () => {
    expect(sliderValueFromPointer({ ...base, clientPos: 100, axis: 'y' })).toBe(100)
    expect(sliderValueFromPointer({ ...base, clientPos: 300, axis: 'y' })).toBe(0)
  })
  it('snaps to a step', () => {
    const v = sliderValueFromPointer({
      trackStart: 0,
      trackLength: 100,
      min: 1,
      max: 5,
      step: 1,
      axis: 'x',
      clientPos: 33,
    })
    expect(Number.isInteger(v)).toBe(true)
    expect(v).toBeGreaterThanOrEqual(1)
    expect(v).toBeLessThanOrEqual(5)
  })
  it('clamps outside the track', () => {
    expect(sliderValueFromPointer({ ...base, clientPos: 0, axis: 'x' })).toBe(0)
    expect(sliderValueFromPointer({ ...base, clientPos: 9999, axis: 'x' })).toBe(100)
  })
})

describe('foldGamepad', () => {
  const mapping: GamepadMapping = {
    buttons: { 0: 'a', 1: 'b' },
    axes: { left: [0, 1] },
    deadzone: 0.12,
  }
  const snap = (buttons: number[], axes: number[]) => ({ buttons, axes })

  it('emits a press edge once, then nothing while held', () => {
    const press = foldGamepad(snap([0, 0], [0, 0]), snap([1, 0], [0, 0]), mapping)
    expect(press.digital).toEqual([{ id: 'a', pressed: true, source: 'gamepad' }])
    const held = foldGamepad(snap([1, 0], [0, 0]), snap([1, 0], [0, 0]), mapping)
    expect(held.digital).toEqual([])
  })
  it('emits a release edge', () => {
    const rel = foldGamepad(snap([1, 0], [0, 0]), snap([0, 0], [0, 0]), mapping)
    expect(rel.digital).toEqual([{ id: 'a', pressed: false, source: 'gamepad' }])
  })
  it('ignores unmapped buttons', () => {
    const r = foldGamepad(snap([0, 0, 0], [0, 0]), snap([0, 0, 1], [0, 0]), mapping)
    expect(r.digital).toEqual([])
  })
  it('emits an analog sample crossing the deadzone, screen-up-positive', () => {
    const r = foldGamepad(snap([0, 0], [0, 0]), snap([0, 0], [0.5, -0.5]), mapping)
    expect(r.analog).toEqual([{ side: 'left', x: 0.5, y: 0.5, source: 'gamepad' }])
  })
  it('does not re-emit an unchanged analog sample', () => {
    const r = foldGamepad(snap([0, 0], [0.5, -0.5]), snap([0, 0], [0.5, -0.5]), mapping)
    expect(r.analog).toEqual([])
  })
  it('treats a sub-deadzone axis as zero', () => {
    const r = foldGamepad(null, snap([0, 0], [0.05, 0.05]), mapping)
    expect(r.analog).toEqual([])
  })
  it('honors a remapped logical id for the same physical index', () => {
    const remapped: GamepadMapping = { ...mapping, buttons: { 0: 'jump' } }
    const r = foldGamepad(snap([0], []), snap([1], []), remapped)
    expect(r.digital).toEqual([{ id: 'jump', pressed: true, source: 'gamepad' }])
  })
})
