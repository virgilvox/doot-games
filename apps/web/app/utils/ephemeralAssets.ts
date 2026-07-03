/**
 * The client half of the Claim-Check offload (see docs/ephemeral-blobs.md). Hands the
 * engine's relay wrapper an {@link AssetTransport}: when a published value is too big
 * for one CLASP frame, the wrapper `upload`s the bytes here and puts a tiny reference
 * (the returned URL) on the relay; subscribers `resolve` it back.
 *
 * Both calls are SAME-ORIGIN to our own API, which then talks to object storage
 * server-side with signed PUT/GET. This avoids every DigitalOcean Spaces weak spot
 * (browser CORS, public-read ACL, presigned POST) and needs no bucket config.
 * Client-only (all callers are `.client.vue`).
 */
import type { AssetTransport } from '@doot-games/engine'

export function createEphemeralAssets(roomCode: string): AssetTransport {
  const base = `/api/rooms/${encodeURIComponent(roomCode)}/blobs`
  return {
    async upload(bytes: Uint8Array, contentType: string): Promise<string> {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: bytes as BodyInit,
      })
      if (!res.ok) throw new Error(`Ephemeral upload failed (${res.status}).`)
      const { url } = (await res.json()) as { url: string }
      return url
    },

    async resolve(url: string): Promise<Uint8Array> {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Ephemeral fetch failed (${res.status}).`)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}
