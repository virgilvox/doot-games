/**
 * Map-authoring dev tool: bakes each map and dumps an SVG of the road geometry
 * (centerline, edges, barrier mask, obstacles, item boxes, checkpoints) to /tmp,
 * plus a min-turn-radius report per course. Open /tmp/pp-track-<id>.svg in a
 * browser while tuning control points; the hard regression guards live in
 * logic.test.ts (this file just makes the geometry visible).
 */
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { MAPS, bakeMap } from './maps'

describe('track viz dump', () => {
  it('writes /tmp/pp-track-<id>.svg', () => {
    for (const m of MAPS) {
      const b = bakeMap(m.id, 'VIZ1')
      const pad = 30
      const minX = b.bounds.nx - pad
      const minZ = b.bounds.nz - pad
      const w = b.bounds.sx + pad * 2
      const h = b.bounds.sz + pad * 2
      const pts: string[] = []
      const left: string[] = []
      const right: string[] = []
      for (let i = 0; i < b.n; i += 2) {
        const s = b.samples[i]!
        pts.push(`${s.x.toFixed(1)},${s.z.toFixed(1)}`)
        left.push(`${(s.x - (s.rx * b.roadW) / 2).toFixed(1)},${(s.z - (s.rz * b.roadW) / 2).toFixed(1)}`)
        right.push(`${(s.x + (s.rx * b.roadW) / 2).toFixed(1)},${(s.z + (s.rz * b.roadW) / 2).toFixed(1)}`)
      }
      const barR: string[] = []
      const barL: string[] = []
      for (let i = 0; i < b.n; i += 3) {
        const s = b.samples[i]!
        const bm = b.barrier[i]!
        if (bm & 1)
          barR.push(`<circle cx="${(s.x + s.rx * (b.roadW / 2 + 2.1)).toFixed(1)}" cy="${(s.z + s.rz * (b.roadW / 2 + 2.1)).toFixed(1)}" r="1.4" fill="#ff4d5e"/>`)
        if (bm & 2)
          barL.push(`<circle cx="${(s.x - s.rx * (b.roadW / 2 + 2.1)).toFixed(1)}" cy="${(s.z - s.rz * (b.roadW / 2 + 2.1)).toFixed(1)}" r="1.4" fill="#4ec3e0"/>`)
      }
      const obs = b.obstacles
        .map(
          (o) =>
            `<circle cx="${o.x.toFixed(1)}" cy="${o.z.toFixed(1)}" r="${o.r.toFixed(1)}" fill="none" stroke="#5fe08a" stroke-width="1.2"/>`,
        )
        .join('')
      const boxes = b.itemBoxes
        .map((x) => `<rect x="${(x.x - 1.2).toFixed(1)}" y="${(x.z - 1.2).toFixed(1)}" width="2.4" height="2.4" fill="#ffd23f"/>`)
        .join('')
      const cps = b.checkpoints
        .map(
          (c, i) =>
            `<circle cx="${c.rx.toFixed(1)}" cy="${c.rz.toFixed(1)}" r="2.4" fill="${i === 0 ? '#fff' : '#b48ae0'}"/><text x="${(c.rx + 4).toFixed(1)}" y="${c.rz.toFixed(1)}" font-size="9" fill="#b48ae0">${i}</text>`,
        )
        .join('')
      const ctrl = m.track.control
        .map(
          (p, i) =>
            `<circle cx="${p[0]}" cy="${p[2]}" r="2.2" fill="#ff9b2e"/><text x="${p[0] + 4}" y="${p[2] - 3}" font-size="9" fill="#ff9b2e">c${i}</text>`,
        )
        .join('')
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minZ} ${w} ${h}" width="900" height="${Math.round((900 * h) / w)}">
<rect x="${minX}" y="${minZ}" width="${w}" height="${h}" fill="#15131a"/>
<polygon points="${left.join(' ')}" fill="none" stroke="#6b6276" stroke-width="1"/>
<polygon points="${right.join(' ')}" fill="none" stroke="#6b6276" stroke-width="1"/>
<polygon points="${pts.join(' ')}" fill="none" stroke="#f3eee2" stroke-width="0.8" stroke-dasharray="4 3"/>
${barR.join('')}${barL.join('')}${obs}${boxes}${cps}${ctrl}
<text x="${minX + 8}" y="${minZ + 16}" font-size="14" fill="#ffd23f">${m.name} (${m.id}) len=${b.length.toFixed(0)} roadW=${b.roadW}</text>
</svg>`
      writeFileSync(`/tmp/pp-track-${m.id}.svg`, svg)
      // curvature report: radius = ds / dHeading between successive samples
      let worst = Infinity
      let at = 0
      const step = b.length / b.n
      for (let i = 0; i < b.n; i++) {
        const a = b.samples[i]!
        const c = b.samples[(i + 4) % b.n]!
        let dh = Math.atan2(c.dx, c.dz) - Math.atan2(a.dx, a.dz)
        while (dh > Math.PI) dh -= Math.PI * 2
        while (dh < -Math.PI) dh += Math.PI * 2
        const r = Math.abs(dh) > 1e-5 ? (step * 4) / Math.abs(dh) : Infinity
        if (r < worst) {
          worst = r
          at = i
        }
      }
      const s = b.samples[at]!
      console.log(
        `[${m.id}] len=${b.length.toFixed(0)} minRadius=${worst.toFixed(1)} at i=${at} (${s.x.toFixed(0)},${s.z.toFixed(0)}) roadW/2=${(b.roadW / 2).toFixed(1)} ${worst < b.roadW * 0.9 ? '<<< PINCH' : 'ok'}`,
      )
    }
  })
})
