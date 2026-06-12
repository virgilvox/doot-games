/**
 * Spectator streaming over CLASP-signaled WebRTC. The host captures the emulator
 * canvas and serves one peer connection per viewer; CLASP carries only the
 * signaling (offer / answer / ICE), the media flows host->viewer directly. This
 * is a purely additive "watch by room code" layer; gameplay and controller input
 * never touch it (PRD invariant: second-screen, never shared-video).
 *
 * The engine exposes only a retained `set` (no ephemeral emit), so ICE is sent as
 * an ACCUMULATING ARRAY on one address per direction (the latest set carries every
 * candidate; the receiver processes the growing tail). All signaling rides the
 * room's `/x/rtc/...` channels.
 *
 * THE GOTCHA: CLASP serializes objects by their own enumerable keys, but
 * RTCSessionDescription / RTCIceCandidate expose their fields via prototype
 * getters, so they must be copied to plain objects before publishing.
 *
 * Video only for now: EmulatorJS plays through WebAudio, not a media element, so
 * the canvas captureStream carries no audio (a documented follow-up).
 */

import type { RelayValue } from '@doot-games/engine'

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
}

/** The minimal slice of the room handle the stream needs (publish/subscribe). */
export interface StreamRoom {
  publishExtra: (key: string, value: RelayValue) => void
  onExtra: (keyPattern: string, cb: (value: RelayValue, key: string) => void) => () => void
}

export type ViewerState = 'connecting' | 'connected' | 'failed' | 'closed'

const plainDesc = (d: RTCSessionDescription | null): RelayValue =>
  d ? { type: d.type, sdp: d.sdp } : null
const plainCand = (c: RTCIceCandidate): Record<string, RelayValue> => {
  const j = c.toJSON ? c.toJSON() : (c as unknown as RTCIceCandidateInit)
  return {
    candidate: j.candidate ?? '',
    sdpMid: j.sdpMid ?? null,
    sdpMLineIndex: j.sdpMLineIndex ?? null,
    usernameFragment: j.usernameFragment ?? null,
  }
}

export function webrtcSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined'
}

/**
 * Host side: serve the canvas (via `getCanvas`) to any viewer that announces
 * itself. Returns a controller with a live viewer count and `stop()`.
 */
export function serveStream(room: StreamRoom, getCanvas: () => HTMLCanvasElement | null) {
  const unsubs: Array<() => void> = []
  const peers = new Map<string, { pc: RTCPeerConnection; cands: ReturnType<typeof plainCand>[]; remoteSet: boolean; queue: RTCIceCandidateInit[]; viewed: number }>()
  let cached: MediaStream | null = null
  let stopped = false
  const listeners = new Set<(n: number) => void>()
  const announce = () => {
    for (const cb of listeners) cb(peers.size)
  }

  const stream = (): MediaStream | null => {
    const live = cached?.getVideoTracks()[0]?.readyState === 'live'
    if (cached && live) return cached
    const c = getCanvas()
    if (!c?.captureStream) return null
    try {
      cached = c.captureStream(30)
    } catch {
      return null
    }
    return cached
  }

  // key suffix is `rtc/<viewerId>/<kind>`, so the id is segment [1].
  const viewerOf = (key: string) => key.split('/')[1] ?? ''

  unsubs.push(
    room.onExtra('rtc/hello/*', async (_v, key) => {
      if (stopped) return
      const id = key.split('/')[2]
      if (!id) return
      const existing = peers.get(id)
      if (existing) {
        const st = existing.pc.connectionState
        if (st !== 'failed' && st !== 'closed' && st !== 'disconnected') return
        try {
          existing.pc.close()
        } catch {
          /* ignore */
        }
        peers.delete(id)
      }
      const s = stream()
      if (!s) return
      const pc = new RTCPeerConnection(ICE_CONFIG)
      const rec = { pc, cands: [] as ReturnType<typeof plainCand>[], remoteSet: false, queue: [] as RTCIceCandidateInit[], viewed: 0 }
      peers.set(id, rec)
      announce()
      for (const tr of s.getTracks()) pc.addTrack(tr, s)
      pc.onicecandidate = (e) => {
        if (!e.candidate) return
        rec.cands.push(plainCand(e.candidate))
        room.publishExtra(`rtc/${id}/ice-host`, { list: rec.cands })
      }
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          peers.delete(id)
          announce()
        }
      }
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        room.publishExtra(`rtc/${id}/offer`, { sdp: plainDesc(pc.localDescription) })
      } catch {
        /* a viewer will retry its hello */
      }
    }),
  )
  unsubs.push(
    room.onExtra('rtc/*/answer', async (v, key) => {
      const rec = peers.get(viewerOf(key))
      const sdp = (v as { sdp?: RTCSessionDescriptionInit } | null)?.sdp
      if (!rec || !sdp) return
      try {
        await rec.pc.setRemoteDescription(sdp)
        rec.remoteSet = true
        for (const c of rec.queue.splice(0)) rec.pc.addIceCandidate(c).catch(() => {})
      } catch {
        /* ignore */
      }
    }),
  )
  unsubs.push(
    room.onExtra('rtc/*/ice-view', (v, key) => {
      const rec = peers.get(viewerOf(key))
      const list = (v as { list?: RTCIceCandidateInit[] } | null)?.list
      if (!rec || !Array.isArray(list)) return
      for (let i = rec.viewed; i < list.length; i++) {
        const c = list[i]
        if (!c) continue
        if (rec.remoteSet) rec.pc.addIceCandidate(c).catch(() => {})
        else rec.queue.push(c)
      }
      rec.viewed = list.length
    }),
  )

  return {
    viewerCount: () => peers.size,
    onViewerCount: (cb: (n: number) => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    stop() {
      stopped = true
      for (const u of unsubs) u()
      for (const { pc } of peers.values()) {
        try {
          pc.close()
        } catch {
          /* ignore */
        }
      }
      peers.clear()
      cached = null
      announce()
    },
  }
}

/**
 * Viewer side: connect to the host's broadcast and pipe the remote video into
 * `videoEl`. Retries its hello until connected. Returns `{ close }`.
 */
export function createViewer(
  room: StreamRoom,
  videoEl: HTMLVideoElement,
  onState?: (s: ViewerState) => void,
) {
  const id = `v${Math.random().toString(36).slice(2, 10)}`
  const pc = new RTCPeerConnection(ICE_CONFIG)
  const unsubs: Array<() => void> = []
  const cands: ReturnType<typeof plainCand>[] = []
  let remoteSet = false
  let viewed = 0
  const queue: RTCIceCandidateInit[] = []
  let helloTimer: ReturnType<typeof setInterval> | null = null
  let tries = 0
  // The video element can move (e.g. orientation flip relocates it from the pad's
  // centre column to a portrait top region), so keep the last stream and re-point.
  let el: HTMLVideoElement = videoEl
  let lastStream: MediaStream | null = null
  const paint = () => {
    if (!lastStream) return
    el.srcObject = lastStream
    el.muted = true
    el.play?.().catch(() => {})
  }

  const report = () => {
    const st = pc.connectionState
    if (st === 'connected') onState?.('connected')
    else if (st === 'failed') onState?.('failed')
    else if (st === 'closed') onState?.('closed')
    else onState?.('connecting')
  }
  pc.ontrack = (e) => {
    if (e.streams[0]) {
      lastStream = e.streams[0]
      paint()
    }
  }
  pc.onicecandidate = (e) => {
    if (!e.candidate) return
    cands.push(plainCand(e.candidate))
    room.publishExtra(`rtc/${id}/ice-view`, { list: cands })
  }
  pc.onconnectionstatechange = report
  pc.oniceconnectionstatechange = report

  unsubs.push(
    room.onExtra(`rtc/${id}/offer`, async (v) => {
      const sdp = (v as { sdp?: RTCSessionDescriptionInit } | null)?.sdp
      if (!sdp) return
      try {
        await pc.setRemoteDescription(sdp)
        remoteSet = true
        for (const c of queue.splice(0)) pc.addIceCandidate(c).catch(() => {})
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        room.publishExtra(`rtc/${id}/answer`, { sdp: plainDesc(pc.localDescription) })
      } catch {
        onState?.('failed')
      }
    }),
  )
  unsubs.push(
    room.onExtra(`rtc/${id}/ice-host`, (v) => {
      const list = (v as { list?: RTCIceCandidateInit[] } | null)?.list
      if (!Array.isArray(list)) return
      for (let i = viewed; i < list.length; i++) {
        const c = list[i]
        if (!c) continue
        if (remoteSet) pc.addIceCandidate(c).catch(() => {})
        else queue.push(c)
      }
      viewed = list.length
    }),
  )

  const hello = () => room.publishExtra(`rtc/hello/${id}`, { t: tries })
  onState?.('connecting')
  hello()
  helloTimer = setInterval(() => {
    const st = pc.connectionState
    if (st === 'connected' || tries++ > 25) {
      if (helloTimer) clearInterval(helloTimer)
      helloTimer = null
      return
    }
    hello()
  }, 2000)

  return {
    /** Re-point the stream at a different <video> (it moved in the DOM). */
    attach(next: HTMLVideoElement) {
      el = next
      paint()
    },
    close() {
      if (helloTimer) clearInterval(helloTimer)
      for (const u of unsubs) u()
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      onState?.('closed')
    },
  }
}
