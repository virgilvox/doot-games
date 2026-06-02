import { describe, expect, it, vi } from 'vitest'
import { createPortHost } from './host'
import { attachPluginPort } from './plugin'
import { hostToPlugin, PROTOCOL_VERSION, pluginToHost } from './protocol'

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
const asPort = (p: unknown) => p as unknown as MessagePort

describe('protocol schemas', () => {
  it('accepts well-formed host->plugin messages (init carries a protocol version)', () => {
    expect(hostToPlugin.safeParse({ t: 'init', block: 'trivia', role: 'player', theme: {}, protocolVersion: 1 }).success).toBe(true)
    expect(hostToPlugin.safeParse({ t: 'round', content: { q: 1 }, phase: 'open', index: 0 }).success).toBe(true)
    expect(hostToPlugin.safeParse({ t: 'answer', key: { correct: 1 } }).success).toBe(true)
  })

  it('rejects malformed and unknown host->plugin messages', () => {
    expect(hostToPlugin.safeParse({ t: 'init', block: 'trivia', role: 'player', theme: {} }).success).toBe(false) // missing version
    expect(hostToPlugin.safeParse({ t: 'init', block: 'trivia', role: 'spectator', theme: {}, protocolVersion: 1 }).success).toBe(false)
    expect(hostToPlugin.safeParse({ t: 'round', content: {}, phase: 'open', index: -1 }).success).toBe(false)
    expect(hostToPlugin.safeParse({ t: 'nope' }).success).toBe(false)
    expect(hostToPlugin.safeParse('not even an object').success).toBe(false)
  })

  it('accepts well-formed plugin->host messages and bounds resize', () => {
    expect(pluginToHost.safeParse({ t: 'ready', protocolVersion: 1 }).success).toBe(true)
    expect(pluginToHost.safeParse({ t: 'ready' }).success).toBe(false) // version required
    expect(pluginToHost.safeParse({ t: 'submit', input: { choice: 1 } }).success).toBe(true)
    expect(pluginToHost.safeParse({ t: 'resize', h: 520 }).success).toBe(true)
    expect(pluginToHost.safeParse({ t: 'resize', h: 99999 }).success).toBe(false)
    expect(pluginToHost.safeParse({ t: 'evil', input: 1 }).success).toBe(false)
  })
})

describe('host <-> plugin round trip', () => {
  it('handshakes (with version), delivers state, and round-trips a submit', async () => {
    const onReady = vi.fn()
    const onSubmit = vi.fn()
    const onInit = vi.fn()
    const onRound = vi.fn()

    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    const host = createPortHost(asPort(hostPort), { onReady, onSubmit })
    const conn = attachPluginPort(asPort(pluginPort), { onInit, onRound })

    await flush() // the plugin announces `ready` (with its protocol version) on attach
    expect(onReady).toHaveBeenCalledWith({ protocolVersion: PROTOCOL_VERSION })

    host.send({ t: 'init', block: 'trivia', role: 'player', theme: { '--accent': '#f0f' }, protocolVersion: PROTOCOL_VERSION })
    host.send({ t: 'round', content: { q: 'hottest planet?' }, phase: 'open', index: 0 })
    await flush()
    expect(onInit).toHaveBeenCalledWith(expect.objectContaining({ block: 'trivia', role: 'player' }))
    expect(onRound).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }))

    conn.submit({ choice: 1 }) // accepted: the round is in the 'open' phase
    await flush()
    expect(onSubmit).toHaveBeenCalledWith({ choice: 1 })
  })

  it('withholds the answer until the host sends it at reveal', async () => {
    const onAnswer = vi.fn()
    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    const host = createPortHost(asPort(hostPort), {})
    attachPluginPort(asPort(pluginPort), { onAnswer })

    host.send({ t: 'round', content: { q: 'x' }, phase: 'open', index: 0 })
    host.send({ t: 'state', myInput: { choice: 1 }, phase: 'locked' })
    await flush()
    expect(onAnswer).not.toHaveBeenCalled() // never leaked during the round

    host.send({ t: 'answer', key: { correct: 1 } })
    await flush()
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ key: { correct: 1 } }))
  })

  it('drops off-protocol messages from the plugin and surfaces a reason', async () => {
    const onSubmit = vi.fn()
    const onInvalid = vi.fn()
    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    createPortHost(asPort(hostPort), { onSubmit, onInvalid })
    attachPluginPort(asPort(pluginPort), {})
    await flush() // consume the `ready`

    pluginPort.postMessage({ t: 'exfiltrate', cookies: 'stolen' })
    await flush()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledWith({ t: 'exfiltrate', cookies: 'stolen' }, 'schema')
  })
})

describe('host-side enforcement (the plugin is hostile)', () => {
  it('phase-gates submit: dropped outside the open phase, accepted inside it', async () => {
    const onSubmit = vi.fn()
    const onInvalid = vi.fn()
    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    const host = createPortHost(asPort(hostPort), { onSubmit, onInvalid })
    const conn = attachPluginPort(asPort(pluginPort), {})
    await flush()

    host.send({ t: 'round', content: {}, phase: 'locked', index: 0 })
    conn.submit({ sneaky: true })
    await flush()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledWith({ t: 'submit', input: { sneaky: true } }, 'phase')

    host.send({ t: 'round', content: {}, phase: 'open', index: 1 })
    conn.submit({ choice: 2 })
    await flush()
    expect(onSubmit).toHaveBeenCalledWith({ choice: 2 })
  })

  it('size-caps a giant payload before it can reach the relay', async () => {
    const onSubmit = vi.fn()
    const onInvalid = vi.fn()
    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    const host = createPortHost(asPort(hostPort), { onSubmit, onInvalid }, { maxBytes: 200, acceptSubmitPhases: ['open'] })
    attachPluginPort(asPort(pluginPort), {})
    await flush()
    host.send({ t: 'round', content: {}, phase: 'open', index: 0 })
    await flush()

    pluginPort.postMessage({ t: 'submit', input: { blob: 'x'.repeat(1000) } })
    await flush()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledWith(expect.anything(), 'oversize')

    pluginPort.postMessage({ t: 'submit', input: { choice: 1 } })
    await flush()
    expect(onSubmit).toHaveBeenCalledWith({ choice: 1 })
  })

  it('flood-limits a runaway plugin', async () => {
    const onResize = vi.fn()
    const onInvalid = vi.fn()
    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    createPortHost(asPort(hostPort), { onResize, onInvalid }, { maxMessagesPerSecond: 5 })

    for (let i = 0; i < 8; i++) pluginPort.postMessage({ t: 'resize', h: 100 })
    await flush()
    expect(onResize).toHaveBeenCalledTimes(5)
    expect(onInvalid).toHaveBeenCalledTimes(3)
    expect(onInvalid).toHaveBeenLastCalledWith(expect.anything(), 'flood')
  })

  it('refuses a plugin announcing an incompatible protocol major', async () => {
    const onReady = vi.fn()
    const onIncompatible = vi.fn()
    const { host: hostPort, plugin: pluginPort } = fakePortPair()
    createPortHost(asPort(hostPort), { onReady, onIncompatible }, { protocolVersion: 2 })

    pluginPort.postMessage({ t: 'ready', protocolVersion: 1 })
    await flush()
    expect(onReady).not.toHaveBeenCalled()
    expect(onIncompatible).toHaveBeenCalledWith(1)
  })
})
