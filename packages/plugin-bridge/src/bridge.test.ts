import { describe, expect, it, vi } from 'vitest'
import { createPortHost } from './host'
import { attachPluginPort } from './plugin'
import { hostToPlugin, pluginToHost } from './protocol'

/**
 * A deterministic in-memory MessagePort pair. Avoids relying on the DOM or Node's
 * MessagePort timing quirks so the tests exercise OUR validation + dispatch, not
 * the platform's port implementation. postMessage delivers on a microtask, like a
 * real port (so handlers see messages asynchronously, in order).
 */
function fakePortPair() {
  const mk = () => ({ onmessage: null as null | ((ev: { data: unknown }) => void), postMessage: (_: unknown) => {}, start: () => {}, close: () => {} })
  const a = mk()
  const b = mk()
  a.postMessage = (d) => queueMicrotask(() => b.onmessage?.({ data: d }))
  b.postMessage = (d) => queueMicrotask(() => a.onmessage?.({ data: d }))
  return { host: a, plugin: b }
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('protocol schemas', () => {
  it('accepts well-formed host->plugin messages', () => {
    expect(hostToPlugin.safeParse({ t: 'init', block: 'trivia', role: 'player', theme: {} }).success).toBe(true)
    expect(hostToPlugin.safeParse({ t: 'round', content: { q: 1 }, phase: 'active', index: 0 }).success).toBe(true)
    expect(hostToPlugin.safeParse({ t: 'answer', key: { correct: 1 } }).success).toBe(true)
  })

  it('rejects malformed and unknown host->plugin messages', () => {
    expect(hostToPlugin.safeParse({ t: 'init', block: 'trivia', role: 'spectator', theme: {} }).success).toBe(false)
    expect(hostToPlugin.safeParse({ t: 'round', content: {}, phase: 'active', index: -1 }).success).toBe(false)
    expect(hostToPlugin.safeParse({ t: 'nope' }).success).toBe(false)
    expect(hostToPlugin.safeParse('not even an object').success).toBe(false)
  })

  it('accepts well-formed plugin->host messages and bounds resize', () => {
    expect(pluginToHost.safeParse({ t: 'ready' }).success).toBe(true)
    expect(pluginToHost.safeParse({ t: 'submit', input: { choice: 1 } }).success).toBe(true)
    expect(pluginToHost.safeParse({ t: 'resize', h: 520 }).success).toBe(true)
    expect(pluginToHost.safeParse({ t: 'resize', h: 99999 }).success).toBe(false)
    expect(pluginToHost.safeParse({ t: 'evil', input: 1 }).success).toBe(false)
  })
})

describe('host <-> plugin round trip', () => {
  it('handshakes, delivers state, and round-trips a submit', async () => {
    const onReady = vi.fn()
    const onSubmit = vi.fn()
    const onInit = vi.fn()
    const onRound = vi.fn()

    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    const host = createPortHost(hostPort as unknown as MessagePort, { onReady, onSubmit })
    const conn = attachPluginPort(pluginPort as unknown as MessagePort, { onInit, onRound })

    await flush() // the plugin announces `ready` on attach
    expect(onReady).toHaveBeenCalledTimes(1)

    host.send({ t: 'init', block: 'trivia', role: 'player', theme: { '--accent': '#f0f' } })
    host.send({ t: 'round', content: { q: 'hottest planet?' }, phase: 'active', index: 0 })
    await flush()
    expect(onInit).toHaveBeenCalledWith(expect.objectContaining({ block: 'trivia', role: 'player' }))
    expect(onRound).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }))

    conn.submit({ choice: 1 })
    await flush()
    expect(onSubmit).toHaveBeenCalledWith({ choice: 1 })
  })

  it('withholds the answer until the host sends it at reveal', async () => {
    const onAnswer = vi.fn()
    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    const host = createPortHost(hostPort as unknown as MessagePort, {})
    attachPluginPort(pluginPort as unknown as MessagePort, { onAnswer })

    host.send({ t: 'round', content: { q: 'x' }, phase: 'active', index: 0 })
    host.send({ t: 'state', myInput: { choice: 1 }, phase: 'locked' })
    await flush()
    expect(onAnswer).not.toHaveBeenCalled() // never leaked during the round

    host.send({ t: 'answer', key: { correct: 1 } })
    await flush()
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ key: { correct: 1 } }))
  })

  it('drops off-protocol messages from the plugin and surfaces them', async () => {
    const onSubmit = vi.fn()
    const onInvalid = vi.fn()
    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    createPortHost(hostPort as unknown as MessagePort, { onSubmit, onInvalid })
    attachPluginPort(pluginPort as unknown as MessagePort, {})
    await flush() // consume the `ready`

    // A compromised plugin posts something off-protocol straight at the host port.
    pluginPort.postMessage({ t: 'exfiltrate', cookies: 'stolen' })
    await flush()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledWith({ t: 'exfiltrate', cookies: 'stolen' })
  })
})
