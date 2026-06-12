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
 * Audio: EmulatorJS plays through WebAudio (not a media element), so the host taps
 * it into a MediaStream (see emulator.ts `getAudioStream`) and folds that track in
 * alongside the canvas video. The viewer starts muted (autoplay rules) and unmutes
 * from a user gesture via the viewer's `setMuted`.
 */

import type { RelayValue } from '@doot-games/engine'

// Google's public STUN servers (the CLASP-recommended default). STUN tells each
// peer its public IP, which is enough for most home/office NATs; the full set gives
// redundancy if one is slow or down. A symmetric NAT needs TURN (see setRtcConfig).
const DEFAULT_ICE: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302',
    ],
  },
]
// Module-level so a host-fanout mesh that STUN can't punch through can be given a
// TURN relay. CLASP is signaling-only (pub/sub), so TURN is a SEPARATE server (e.g.
// coturn); the app sets it once from runtime env via setRtcConfig (see the rtc
// plugin + docs/deploy.md). Default is STUN-only.
let rtcConfig: RTCConfiguration = { iceServers: DEFAULT_ICE }

/**
 * Configure the ICE servers used by every new peer connection. Pass a TURN server
 * (url may be a comma-separated list, e.g. "turn:host:3478,turns:host:5349") with
 * its credentials to relay media for viewers behind symmetric NATs. STUN stays in
 * the list. Called once at app start; no-op TURN keeps the STUN-only default.
 */
export function setRtcConfig(turn?: {
  url?: string | null
  username?: string | null
  credential?: string | null
}): void {
  const servers: RTCIceServer[] = [...DEFAULT_ICE]
  const urls = (turn?.url ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (urls.length) {
    const entry: RTCIceServer = { urls }
    if (turn?.username) entry.username = turn.username
    if (turn?.credential) entry.credential = turn.credential
    servers.push(entry)
  }
  rtcConfig = { iceServers: servers }
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
export function serveStream(
  room: StreamRoom,
  getCanvas: () => HTMLCanvasElement | null,
  getAudio?: () => MediaStream | null,
) {
  const unsubs: Array<() => void> = []
  type Peer = {
    pc: RTCPeerConnection
    cands: ReturnType<typeof plainCand>[]
    remoteSet: boolean
    queue: RTCIceCandidateInit[]
    viewed: number
    videoSender?: RTCRtpSender
    audioSender?: RTCRtpSender
  }
  const peers = new Map<string, Peer>()
  let cached: MediaStream | null = null
  let lastCanvas: HTMLCanvasElement | null = null
  let stopped = false
  const listeners = new Set<(n: number) => void>()
  const announce = () => {
    for (const cb of listeners) cb(peers.size)
  }

  // Keep `cached` in sync with the live canvas + audio: recapture when the canvas
  // CHANGES (a ROM hot-swap makes a NEW canvas, whose old captureStream track stays
  // "live" but frozen), and fold in the emulator audio track once the game routes
  // sound (which often starts AFTER viewers connect). Returns the current stream.
  const ensureStream = (): MediaStream | null => {
    const c = getCanvas()
    if (c?.captureStream && c !== lastCanvas) {
      try {
        cached = c.captureStream(30)
        lastCanvas = c
      } catch {
        /* keep the previous capture */
      }
    }
    if (cached && cached.getAudioTracks().length === 0) {
      const a = getAudio?.()?.getAudioTracks()[0]
      if (a) {
        try {
          cached.addTrack(a)
        } catch {
          /* already added / cross-context */
        }
      }
    }
    return cached
  }

  // Push the current video + audio tracks onto every connected peer with replaceTrack
  // (no renegotiation), so a hot-swap or late-arriving audio reaches viewers already
  // connected. This is also what makes a viewer who joined before the game made any
  // sound eventually hear it (their audio m-line was set up empty up front).
  const syncPeers = () => {
    const s = ensureStream()
    if (!s) return
    const v = s.getVideoTracks()[0] ?? null
    const a = s.getAudioTracks()[0] ?? null
    for (const rec of peers.values()) {
      if (v && rec.videoSender && rec.videoSender.track !== v) rec.videoSender.replaceTrack(v).catch(() => {})
      if (a && rec.audioSender && rec.audioSender.track !== a) rec.audioSender.replaceTrack(a).catch(() => {})
    }
  }
  const syncTimer = setInterval(() => {
    if (!stopped && peers.size) syncPeers()
  }, 1500)

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
      const s = ensureStream()
      if (!s) return
      const pc = new RTCPeerConnection(rtcConfig)
      const rec: Peer = { pc, cands: [], remoteSet: false, queue: [], viewed: 0 }
      peers.set(id, rec)
      announce()
      const v = s.getVideoTracks()[0]
      if (v) rec.videoSender = pc.addTrack(v, s)
      // Always set up an audio m-line: with the track if present, else an empty
      // sendonly transceiver the sync loop fills via replaceTrack. So a viewer who
      // connects BEFORE the game makes sound still gets audio later, with no
      // renegotiation (replaceTrack within the negotiated transceiver).
      if (getAudio) {
        const a = s.getAudioTracks()[0]
        rec.audioSender = a
          ? pc.addTrack(a, s)
          : pc.addTransceiver('audio', { direction: 'sendonly', streams: [s] }).sender
      }
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
      clearInterval(syncTimer)
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
  const pc = new RTCPeerConnection(rtcConfig)
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
  // Start muted so the video autoplays (browsers block sound without a gesture);
  // the consumer flips this from a tap via setMuted. Sticky across re-attach.
  let muted = true
  const paint = () => {
    if (!lastStream) return
    el.srcObject = lastStream
    el.muted = muted
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
    /** Mute/unmute the audio (call from a user gesture to unmute, autoplay rules). */
    setMuted(m: boolean) {
      muted = m
      el.muted = m
      if (!m) el.play?.().catch(() => {})
    },
    /** Whether the received stream carries an audio track. */
    hasAudio() {
      return !!lastStream && lastStream.getAudioTracks().length > 0
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
