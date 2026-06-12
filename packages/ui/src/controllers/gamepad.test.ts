import { describe, expect, it } from 'vitest'
import { type GamepadEnv, createGamepadBridge } from './gamepad'
import type { AnalogInputEvent, DigitalInputEvent } from './logical-input'

/** A controllable fake Gamepad API for driving the bridge frame by frame. */
function harness() {
  let pads: Array<Gamepad | null> = [null]
  const frames: Array<() => void> = []
  const listeners: Record<string, (e: Event) => void> = {}
  const env: GamepadEnv = {
    getGamepads: () => pads,
    requestAnimationFrame: (cb) => {
      frames.push(cb)
      return frames.length
    },
    cancelAnimationFrame: () => {},
    addEventListener: (type, l) => {
      listeners[type] = l
    },
    removeEventListener: (type) => {
      delete listeners[type]
    },
  }
  const step = () => {
    const cb = frames.shift()
    if (cb) cb()
  }
  const makePad = (
    down: number[],
    axes: number[] = [0, 0, 0, 0],
    index = 0,
    id = 'Test Pad',
  ): Gamepad =>
    ({
      index,
      id,
      buttons: down.map((v) => ({ value: v, pressed: v >= 0.5, touched: v > 0 })),
      axes,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      hapticActuators: [],
      vibrationActuator: null,
    }) as unknown as Gamepad
  return {
    env,
    step,
    makePad,
    setPads: (p: Array<Gamepad | null>) => {
      pads = p
    },
    fire: (type: string, gamepad: Partial<Gamepad>) =>
      listeners[type]?.({ gamepad } as unknown as Event),
  }
}

describe('createGamepadBridge', () => {
  it('is a safe no-op when there is no Gamepad API', () => {
    const bridge = createGamepadBridge({ onInput: () => {}, onAxis: () => {} })
    expect(bridge.isConnected()).toBe(false)
    expect(() => {
      bridge.start()
      bridge.stop()
    }).not.toThrow()
  })

  it('emits a press edge from a connected pad and nothing while held', () => {
    const h = harness()
    const digital: DigitalInputEvent[] = []
    h.setPads([h.makePad([0, 0])])
    const bridge = createGamepadBridge({
      env: h.env,
      onInput: (e) => digital.push(e),
      onAxis: () => {},
    })
    bridge.start()
    h.step() // baseline frame (button 0 up)
    h.setPads([h.makePad([1, 0])])
    h.step()
    expect(digital).toEqual([{ id: 'a', pressed: true, source: 'gamepad' }])
    h.step() // still held -> no new event
    expect(digital).toHaveLength(1)
    h.setPads([h.makePad([0, 0])])
    h.step()
    expect(digital.at(-1)).toEqual({ id: 'a', pressed: false, source: 'gamepad' })
    bridge.stop()
  })

  it('emits screen-up-positive analog samples from the left stick', () => {
    const h = harness()
    const analog: AnalogInputEvent[] = []
    h.setPads([h.makePad([0, 0], [0, 0, 0, 0])])
    const bridge = createGamepadBridge({
      env: h.env,
      onInput: () => {},
      onAxis: (e) => analog.push(e),
    })
    bridge.start()
    h.step()
    h.setPads([h.makePad([0, 0], [0.5, -0.5, 0, 0])])
    h.step()
    expect(analog).toEqual([{ side: 'left', x: 0.5, y: 0.5, source: 'gamepad' }])
    bridge.stop()
  })

  it('applies a live remap without restart', () => {
    const h = harness()
    const digital: DigitalInputEvent[] = []
    h.setPads([h.makePad([0, 0])])
    const bridge = createGamepadBridge({
      env: h.env,
      onInput: (e) => digital.push(e),
      onAxis: () => {},
    })
    bridge.start()
    h.step()
    bridge.setMapping({ buttons: { 0: 'jump' } })
    h.setPads([h.makePad([1, 0])])
    h.step()
    expect(digital).toEqual([{ id: 'jump', pressed: true, source: 'gamepad' }])
    bridge.stop()
  })

  it('registers a digital button reported as pressed with value 0', () => {
    const h = harness()
    const digital: DigitalInputEvent[] = []
    // A pad whose button 0 is pressed but reports value 0 (digital buttons may).
    const padUp = {
      index: 0,
      id: 'BT Pad',
      buttons: [{ value: 0, pressed: false }],
      axes: [],
      connected: true,
    } as unknown as Gamepad
    const padDown = {
      index: 0,
      id: 'BT Pad',
      buttons: [{ value: 0, pressed: true }],
      axes: [],
      connected: true,
    } as unknown as Gamepad
    h.setPads([padUp])
    const bridge = createGamepadBridge({
      env: h.env,
      onInput: (e) => digital.push(e),
      onAxis: () => {},
    })
    bridge.start()
    h.step()
    h.setPads([padDown])
    h.step()
    expect(digital).toEqual([{ id: 'a', pressed: true, source: 'gamepad' }])
    bridge.stop()
  })

  it('reports connect events', () => {
    const h = harness()
    const connects: Array<{ index: number; id: string }> = []
    const bridge = createGamepadBridge({
      env: h.env,
      onInput: () => {},
      onAxis: () => {},
      onConnect: (i) => connects.push(i),
    })
    bridge.start()
    h.fire('gamepadconnected', { index: 0, id: 'Xbox' })
    expect(connects).toContainEqual({ index: 0, id: 'Xbox' })
    bridge.stop()
  })
})
