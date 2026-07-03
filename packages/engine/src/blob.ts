/**
 * Claim-Check transport for the relay (see docs/ephemeral-blobs.md).
 *
 * CLASP frames are length-prefixed with a uint16, so a single published value
 * physically cannot exceed 65535 bytes; `@clasp-to/core`'s `encodeFrame` throws
 * `Payload too large: N bytes (max 65535)` past it. Party games that aggregate
 * many artifacts into one value (every player's drawing on a results screen, an
 * anonymized gallery to vote on) blow through that ceiling and strand the room.
 *
 * The fix is the industry-standard Claim-Check / reference-based-messaging
 * pattern (Azure Architecture Center; EIP "Store in Library"), the same move
 * Pusher/Ably/PubNub docs recommend for oversized messages and that tldraw's
 * `TLAssetStore` implements for binary assets: store the heavy bytes in
 * ephemeral object storage and publish only a small reference over the relay.
 *
 * This module is transport-agnostic: the relay wrapper measures a value, and if
 * it is too big to fit a frame it hands the bytes to an {@link AssetTransport}
 * (object storage in production, an in-memory fake in tests) and publishes a
 * tiny {@link BlobEnvelope} in its place. Readers resolve the envelope back to
 * the original value before it ever reaches a game or a component, so the whole
 * mechanism is invisible above the relay.
 */
import type { RelayValue } from './relay'

/**
 * The out-of-band store the relay offloads heavy values to. `upload` MUST resolve
 * only once the object is durably readable (confirm the write before the caller
 * publishes the reference), so a subscriber can never receive a reference to an
 * object that is not yet GET-able (the classic read-after-write race).
 */
export interface AssetTransport {
  /** Store `bytes` and resolve with a URL the same runtime can later `resolve`. */
  upload(bytes: Uint8Array, contentType: string): Promise<string>
  /** Fetch the bytes previously stored at `url`. */
  resolve(url: string): Promise<Uint8Array>
}

/** The small claim-check reference published in place of an offloaded value. */
export interface BlobRef {
  /** Where the bytes live (resolvable by the {@link AssetTransport}). */
  url: string
  /** Byte length of the stored payload (diagnostics + sanity checks). */
  n: number
  /** Content type of the stored payload (JSON for offloaded relay values). */
  ct: string
}

/**
 * A distinctive, namespaced key so a real game value can never be mistaken for a
 * reference. Games publish plain state; nothing authored uses this key.
 */
export const BLOB_REF_KEY = '__dootBlob' as const

export type BlobEnvelope = { [BLOB_REF_KEY]: BlobRef }

/** True when a delivered relay value is a claim-check reference, not real state. */
export function isBlobEnvelope(value: unknown): value is BlobEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const ref = (value as Record<string, unknown>)[BLOB_REF_KEY]
  if (typeof ref !== 'object' || ref === null) return false
  const r = ref as Record<string, unknown>
  return typeof r.url === 'string' && typeof r.n === 'number' && typeof r.ct === 'string'
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Serialize a value to the JSON bytes we store off-relay. */
export function encodeValue(value: RelayValue): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

/** Parse offloaded bytes back into a relay value. */
export function decodeValue(bytes: Uint8Array): RelayValue {
  return JSON.parse(decoder.decode(bytes)) as RelayValue
}

/**
 * A safe upper bound on the number of bytes CLASP will encode `value` into.
 *
 * The size gate MUST match CLASP's binary encoder, not JSON: CLASP stores every
 * number as a tagged float64 (9 bytes), so a point-heavy drawing (arrays of
 * floats) encodes LARGER than its JSON form. Measuring JSON length would let such
 * a value slip under the threshold and still overflow the 65535-byte frame. This
 * mirrors `@clasp-to/core`'s own `estimateValueSize` (null=1, bool=2, number=9,
 * string=bytes+overhead, array/object add a per-element type tag), using real
 * UTF-8 byte lengths for strings, so the result is always >= the true encoded
 * size. Pure and allocation-light for number-heavy values.
 */
export function claspEncodedSize(value: RelayValue): number {
  if (value === null || value === undefined) return 1
  const t = typeof value
  if (t === 'boolean') return 2
  if (t === 'number') return 9
  if (t === 'string') return encoder.encode(value as string).length + 5
  if (value instanceof Uint8Array) return value.length + 3
  if (Array.isArray(value)) {
    let size = 4
    for (const v of value) size += 1 + claspEncodedSize(v as RelayValue)
    return size
  }
  if (t === 'object') {
    let size = 4
    for (const [k, v] of Object.entries(value as object)) {
      size += encoder.encode(k).length + 6 + claspEncodedSize(v as RelayValue)
    }
    return size
  }
  return 16
}

/**
 * The absolute CLASP ceiling: `encodeFrame` throws above this exact number.
 * We never publish a value whose encoded form exceeds it.
 */
export const CLASP_FRAME_LIMIT_BYTES = 65535

/**
 * Offload any value whose encoded size exceeds this. Sits ~7.5 KB under the frame
 * ceiling so the address + CLASP's message framing have headroom on top of the
 * value. Values under it publish inline exactly as before, so small games (the
 * common case) never touch object storage.
 */
export const OFFLOAD_THRESHOLD_BYTES = 58_000

/** The friendly, actionable message shown when a value cannot be broadcast. */
export function tooLargeMessage(bytes: number): string {
  const kb = Math.round(bytes / 1024)
  return `This round is too large to broadcast to players (${kb} KB, limit about 64 KB). Large drawing galleries or photos need object storage: run MinIO locally (docker compose up minio) or configure Spaces, or use an image URL instead of a pasted image.`
}
