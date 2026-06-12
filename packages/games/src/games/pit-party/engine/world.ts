/**
 * Build the 3D world for a baked track + map theme: the road ribbon, finish gate,
 * barriers (corner walls or edge rails), item boxes, the collidable props (rendered
 * at the EXACT sim obstacle positions, so the cactus you see is the one you hit),
 * and the theme backdrop. Returns handles the renderer animates (item boxes).
 */
import type { Group, InstancedMesh, Material, Object3D, Scene } from 'three'
import type { MapDef } from '../maps/types'
import type { BakedTrack } from '../sim/types'
import { flat, toon } from './prim'
import { checkerTexture, hazardTexture, makeRoadTexture } from './textures'
import type { Three } from './types'

export interface ItemBoxVisual {
  group: Group
  baseY: number
}

export interface WorldHandles {
  group: Group
  itemBoxes: ItemBoxVisual[]
  dispose(): void
}

export function buildWorld(T: Three, scene: Scene, baked: BakedTrack, map: MapDef): WorldHandles {
  const group = new T.Group()
  scene.add(group)

  buildRoad(T, group, baked, map)
  buildGate(T, group, baked)
  buildBarriers(T, group, baked, map)
  const itemBoxes = buildBoxes(T, group, baked)
  buildProps(T, group, baked)
  buildBackdrop(T, group, baked, map)

  return {
    group,
    itemBoxes,
    dispose() {
      scene.remove(group)
      group.traverse((o: Object3D) => {
        const m = o as unknown as { geometry?: { dispose(): void }; material?: Material | Material[] }
        m.geometry?.dispose()
        if (m.material) {
          const ms = Array.isArray(m.material) ? m.material : [m.material]
          for (const mat of ms) {
            const t = mat as unknown as { map?: { dispose(): void }; dispose(): void }
            t.map?.dispose()
            t.dispose()
          }
        }
      })
      group.clear()
    },
  }
}

function buildRoad(T: Three, group: Group, baked: BakedTrack, map: MapDef): void {
  const tex = makeRoadTexture(T, map.theme.road)
  tex.wrapS = T.RepeatWrapping
  const { samples, n, roadW } = baked
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= n; i++) {
    const ii = i % n
    const p = samples[ii]!
    pos.push(p.x - p.rx * (roadW / 2), p.y + 0.02, p.z - p.rz * (roadW / 2))
    pos.push(p.x + p.rx * (roadW / 2), p.y + 0.02, p.z + p.rz * (roadW / 2))
    uv.push(i * 0.22, 0, i * 0.22, 1)
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mat = map.theme.roadLit
    ? new T.MeshLambertMaterial({ map: tex })
    : new T.MeshBasicMaterial({ map: tex })
  group.add(new T.Mesh(geo, mat))
  if (baked.voidFall) {
    const under = new T.Mesh(geo.clone(), new T.MeshBasicMaterial({ color: 0x2a1a4e, side: T.BackSide }))
    under.position.y = -0.08
    group.add(under)
  }
}

function buildGate(T: Three, group: Group, baked: BakedTrack): void {
  const fi = baked.finishIndex
  const p = baked.samples[fi]!
  const roadW = baked.roadW
  const line = new T.Mesh(new T.PlaneGeometry(roadW, 3.4), new T.MeshBasicMaterial({ map: checkerTexture(T) }))
  line.rotation.x = -Math.PI / 2
  line.position.set(p.x, p.y + 0.04, p.z)
  line.rotation.z = Math.atan2(p.dx, p.dz)
  group.add(line)
  const postGeo = new T.CylinderGeometry(0.5, 0.5, 11, 8)
  const postMat = toon(T, 0x1a1722)
  for (const side of [-1, 1]) {
    const m = new T.Mesh(postGeo, postMat)
    m.position.set(p.x + p.rx * side * (roadW / 2 + 1), p.y + 5.5, p.z + p.rz * side * (roadW / 2 + 1))
    group.add(m)
  }
  const banner = new T.Mesh(
    new T.BoxGeometry(roadW + 4, 2.6, 0.6),
    new T.MeshLambertMaterial({ map: hazardTexture(T) }),
  )
  banner.position.set(p.x, p.y + 10.6, p.z)
  banner.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI / 2
  group.add(banner)
}

function buildBarriers(T: Three, group: Group, baked: BakedTrack, map: MapDef): void {
  const mode = map.track.barrier
  if (mode === 'none') return
  const { samples, n, roadW, barrier } = baked
  const dummy = new T.Object3D()
  if (mode === 'rails') {
    const segs: number[] = []
    for (let i = 0; i < n; i += 6) if (barrier[i]) segs.push(i)
    const railG = new T.BoxGeometry(4.9, 1.4, 0.6)
    const railM = new T.MeshLambertMaterial({ color: 0x2c2733, emissive: 0x451c06 })
    const im = new T.InstancedMesh(railG, railM, segs.length * 2)
    const stripG = new T.BoxGeometry(4.9, 0.18, 0.66)
    const im2 = new T.InstancedMesh(stripG, flat(T, 0xff9b2e), segs.length * 2)
    let c = 0
    for (const i of segs) {
      const p = samples[i]!
      const ry = Math.atan2(p.dx, p.dz) + Math.PI / 2
      for (const side of [1, -1]) {
        dummy.position.set(p.x + p.rx * side * (roadW / 2 + 2.1), p.y + 0.7, p.z + p.rz * side * (roadW / 2 + 2.1))
        dummy.rotation.set(0, ry, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        im.setMatrixAt(c, dummy.matrix)
        dummy.position.y = p.y + 1.45
        dummy.updateMatrix()
        im2.setMatrixAt(c, dummy.matrix)
        c++
      }
    }
    im.count = im2.count = c
    group.add(im, im2)
    return
  }
  // corners: hazard wall segments where the mask is set, on the flagged side.
  const tex = hazardTexture(T, 64, 16)
  tex.wrapS = T.RepeatWrapping
  tex.repeat.set(3, 1)
  const mat = new T.MeshLambertMaterial({ map: tex })
  const seg: Array<{ i: number; side: number }> = []
  for (let i = 0; i < n; i += 6) {
    if (barrier[i]! & 1) seg.push({ i, side: 1 })
    if (barrier[i]! & 2) seg.push({ i, side: -1 })
  }
  const geo = new T.BoxGeometry(5.4, 1.5, 0.7)
  const im = new T.InstancedMesh(geo, mat, seg.length)
  let c = 0
  for (const { i, side } of seg) {
    const p = samples[i]!
    dummy.position.set(p.x + p.rx * side * (roadW / 2 + 2.2), p.y + 0.75, p.z + p.rz * side * (roadW / 2 + 2.2))
    dummy.rotation.set(0, Math.atan2(p.dx, p.dz) + Math.PI / 2, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    im.setMatrixAt(c++, dummy.matrix)
  }
  im.count = c
  group.add(im)
}

function buildBoxes(T: Three, group: Group, baked: BakedTrack): ItemBoxVisual[] {
  const core = new T.BoxGeometry(1.5, 1.5, 1.5)
  const mat = new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6b4f00, transparent: true, opacity: 0.92 })
  const edge = flat(T, 0x14121a)
  const out: ItemBoxVisual[] = []
  for (const b of baked.itemBoxes) {
    const g = new T.Group()
    g.add(new T.Mesh(core, mat))
    const top = new T.Mesh(new T.BoxGeometry(1.7, 0.18, 1.7), edge)
    top.position.y = 0.85
    g.add(top)
    const bot = new T.Mesh(new T.BoxGeometry(1.7, 0.18, 1.7), edge)
    bot.position.y = -0.85
    g.add(bot)
    // a floating "?" mark face so the box reads as a pickup, not just a cube
    const q = new T.Mesh(new T.BoxGeometry(0.22, 0.62, 0.05), flat(T, 0x14121a))
    q.position.set(0, 0.05, 0.78)
    g.add(q)
    g.position.set(b.x, b.y, b.z)
    group.add(g)
    out.push({ group: g, baseY: b.y })
  }
  return out
}

/** Render each collidable obstacle as its prop, grouped by kind into instanced meshes. */
function buildProps(T: Three, group: Group, baked: BakedTrack): void {
  const byKind = new Map<string, typeof baked.obstacles>()
  for (const o of baked.obstacles) {
    const arr = byKind.get(o.kind) ?? []
    arr.push(o)
    byKind.set(o.kind, arr)
  }
  const dummy = new T.Object3D()
  for (const [kind, list] of byKind) {
    const built = propMesh(T, kind, list.length)
    let c = 0
    for (const o of list) {
      dummy.position.set(o.x, o.y + built.lift * o.scale, o.z)
      dummy.rotation.set(0, o.rot, 0)
      dummy.scale.set(o.scale, o.scale, o.scale)
      dummy.updateMatrix()
      for (const im of built.meshes) im.setMatrixAt(c, dummy.matrix)
      c++
    }
    for (const im of built.meshes) {
      im.count = list.length
      group.add(im)
    }
  }
}

function propMesh(
  T: Three,
  kind: string,
  count: number,
): { meshes: InstancedMesh[]; lift: number } {
  if (kind === 'rock') {
    const im = new T.InstancedMesh(new T.IcosahedronGeometry(1.1, 0), toon(T, 0x8a5a4a), count)
    return { meshes: [im], lift: 0.5 }
  }
  if (kind === 'cone') {
    const body = new T.InstancedMesh(new T.ConeGeometry(0.7, 1.7, 10), toon(T, 0xff7b2e), count)
    const band = new T.InstancedMesh(new T.CylinderGeometry(0.55, 0.62, 0.3, 10), flat(T, 0xf3eee2), count)
    return { meshes: [body, band], lift: 0.85 }
  }
  if (kind === 'barrel') {
    const body = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 2.2, 12), toon(T, 0x3a3342), count)
    const ring = new T.InstancedMesh(new T.CylinderGeometry(1.05, 1.05, 0.2, 12), flat(T, 0xff9b2e), count)
    return { meshes: [body, ring], lift: 1.1 }
  }
  // cactus: trunk + two arms (the prop the prototype drew with no collision)
  const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.55, 0.7, 5, 7), toon(T, 0x3f7d52), count)
  const armL = new T.InstancedMesh(new T.CylinderGeometry(0.3, 0.36, 2, 7), toon(T, 0x3f7d52), count)
  return { meshes: [trunk, armL], lift: 2.3 }
}

// Backdrops (visual-only distant scenery)
function buildBackdrop(T: Three, group: Group, baked: BakedTrack, map: MapDef): void {
  switch (map.backdrop) {
    case 'kiln':
      return backdropKiln(T, group)
    case 'sprue':
      return backdropSprue(T, group)
    case 'prism':
      return backdropPrism(T, group, baked)
    case 'neon':
      return backdropNeon(T, group)
    case 'ember':
      return backdropEmber(T, group)
  }
}

function ground(T: Three, group: Group, color: number, r = 560): void {
  const g = new T.Mesh(new T.CircleGeometry(r, 48), toon(T, color))
  g.rotation.x = -Math.PI / 2
  g.position.y = -0.05
  group.add(g)
}

function backdropKiln(T: Three, group: Group): void {
  ground(T, group, 0xc98a5e)
  const ring = new T.Mesh(new T.RingGeometry(330, 560, 48), toon(T, 0xb5764e))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -0.03
  group.add(ring)
  const sun = new T.Mesh(new T.CircleGeometry(46, 40), flat(T, 0xffd9a0, { fog: false }))
  sun.position.set(-340, 52, -520)
  sun.lookAt(0, 52, 0)
  group.add(sun)
  const mesaG = new T.CylinderGeometry(1, 1.35, 1, 9)
  const mesaM = toon(T, 0x9c5a48)
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.5
    const rad = 350 + Math.random() * 120
    const m = new T.Mesh(mesaG, mesaM)
    const h = 46 + Math.random() * 60
    const w = 54 + Math.random() * 70
    m.scale.set(w, h, w)
    m.position.set(Math.cos(ang) * rad, h / 2 - 4, Math.sin(ang) * rad)
    m.rotation.y = Math.random() * 6.28
    group.add(m)
  }
}

function backdropSprue(T: Three, group: Group): void {
  ground(T, group, 0x141014)
  const stackG = new T.CylinderGeometry(2.2, 2.8, 1, 9)
  const stackM = toon(T, 0x241e26)
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + Math.random() * 0.4
    const rad = 300 + Math.random() * 120
    const h = 24 + Math.random() * 60
    const m = new T.Mesh(stackG, stackM)
    m.scale.set(1 + Math.random() * 1.4, h, 1 + Math.random() * 1.4)
    m.position.set(Math.cos(ang) * rad, h / 2, Math.sin(ang) * rad)
    group.add(m)
  }
  const skyG = new T.BoxGeometry(1, 1, 1)
  const skyM = toon(T, 0x0d0a0e)
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.4
    const rad = 380 + Math.random() * 120
    const m = new T.Mesh(skyG, skyM)
    m.scale.set(40 + Math.random() * 60, 30 + Math.random() * 80, 30 + Math.random() * 40)
    m.position.set(Math.cos(ang) * rad, m.scale.y / 2 - 2, Math.sin(ang) * rad)
    group.add(m)
  }
}

function backdropPrism(T: Three, group: Group, baked: BakedTrack): void {
  const dummy = new T.Object3D()
  const tints = [0xff5d8f, 0x4ec3e0, 0xb48ae0, 0xffd23f, 0x5fe08a]
  const cryG = new T.OctahedronGeometry(1, 0)
  for (let t = 0; t < tints.length; t++) {
    const im = new T.InstancedMesh(cryG, flat(T, tints[t]!, { transparent: true, opacity: 0.85 }), 14)
    let cc = 0
    let guard = 0
    while (cc < 14 && guard++ < 300) {
      const x = (Math.random() * 2 - 1) * 460
      const z = (Math.random() * 2 - 1) * 460
      const y = -70 + Math.random() * 150
      if (Math.abs(y - baked.midY) < 26) continue
      const s = 1.5 + Math.random() * 5
      dummy.position.set(x, y, z)
      dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      dummy.scale.set(s, s * 1.7, s)
      dummy.updateMatrix()
      im.setMatrixAt(cc++, dummy.matrix)
    }
    im.count = cc
    group.add(im)
  }
  const planet = new T.Mesh(new T.SphereGeometry(58, 18, 14), flat(T, 0x6a4f9e))
  planet.position.set(-420, 60, -360)
  group.add(planet)
  const ring = new T.Mesh(
    new T.RingGeometry(74, 108, 40),
    flat(T, 0xffd23f, { transparent: true, opacity: 0.5, side: T.DoubleSide }),
  )
  ring.position.copy(planet.position)
  ring.rotation.x = Math.PI / 2.6
  ring.rotation.y = 0.4
  group.add(ring)
  const moon = new T.Mesh(new T.SphereGeometry(18, 12, 9), flat(T, 0xe8e3d6))
  moon.position.set(380, 120, 300)
  group.add(moon)
}

function backdropNeon(T: Three, group: Group): void {
  ground(T, group, 0x0a0716)
  const towerM = toon(T, 0x120c26)
  const winM = flat(T, 0x4ec3e0)
  const win2M = flat(T, 0xff5d8f)
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2 + Math.random() * 0.3
    const rad = 320 + Math.random() * 160
    const h = 60 + Math.random() * 160
    const w = 24 + Math.random() * 34
    const tower = new T.Mesh(new T.BoxGeometry(w, h, w), towerM)
    tower.position.set(Math.cos(ang) * rad, h / 2 - 4, Math.sin(ang) * rad)
    group.add(tower)
    // a glowing window strip
    const strip = new T.Mesh(new T.BoxGeometry(w * 0.2, h * 0.8, 0.6), i % 2 ? winM : win2M)
    strip.position.set(tower.position.x, tower.position.y, tower.position.z + (w / 2 + 0.4) * Math.sign(Math.cos(ang) || 1))
    group.add(strip)
  }
}

function backdropEmber(T: Three, group: Group): void {
  ground(T, group, 0x140a08)
  const dummy = new T.Object3D()
  const poolG = new T.CircleGeometry(1, 18)
  const pools = new T.InstancedMesh(poolG, flat(T, 0xff5a1e), 18)
  let pc = 0
  let guard = 0
  while (pc < 18 && guard++ < 400) {
    const x = (Math.random() * 2 - 1) * 360
    const z = (Math.random() * 2 - 1) * 360
    const s = 5 + Math.random() * 12
    dummy.position.set(x, 0.02, z)
    dummy.rotation.set(-Math.PI / 2, 0, 0)
    dummy.scale.setScalar(s)
    dummy.updateMatrix()
    pools.setMatrixAt(pc++, dummy.matrix)
  }
  pools.count = pc
  group.add(pools)
  const volcM = toon(T, 0x1a0c0a)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.5
    const rad = 380 + Math.random() * 120
    const h = 90 + Math.random() * 80
    const m = new T.Mesh(new T.ConeGeometry(h * 0.7, h, 10), volcM)
    m.position.set(Math.cos(ang) * rad, h / 2 - 6, Math.sin(ang) * rad)
    group.add(m)
  }
}
