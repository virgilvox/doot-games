/**
 * Compress a picked photo to a JPEG data URL that fits the relay budget, entirely
 * on-device. Doot's collected/shared photos ride the relay as ephemeral data URLs
 * (never object storage), so they must be small; this re-encodes at the best
 * size/quality under a character budget and never touches the network.
 *
 * Shared by the `collect` block and any second-screen photo share. Browser-only
 * (uses canvas / Image / FileReader).
 */

/** Default data-URL character budget for a relay-carried photo (~56 KB of base64,
 *  comfortably under a single relay message + TTL). */
export const PHOTO_BUDGET = 56000
const PHOTO_SIZES = [1024, 880, 760, 640, 540, 460, 380]
const PHOTO_QUALITIES = [0.72, 0.62, 0.52, 0.44, 0.36]

/** Read a File, then re-encode to the largest JPEG data URL that fits `budget`.
 *  Falls back to the smallest attempt if even that is somehow over budget. */
export async function compressPhoto(file: File, budget = PHOTO_BUDGET): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(new Error('read'))
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('decode'))
    im.src = dataUrl
  })
  let smallest = ''
  for (const max of PHOTO_SIZES) {
    const scale = Math.min(1, max / Math.max(img.width || max, img.height || max))
    const w = Math.max(1, Math.round((img.width || max) * scale))
    const h = Math.max(1, Math.round((img.height || max) * scale))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return smallest || dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    for (const q of PHOTO_QUALITIES) {
      const out = c.toDataURL('image/jpeg', q)
      smallest = out // each step is smaller than the last; keep the latest as fallback
      if (out.length <= budget) return out
    }
  }
  return smallest || dataUrl
}
