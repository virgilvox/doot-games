/**
 * The six driver models, built from primitives. Each returns a Group sitting in
 * the kart's cockpit. Ported from the KERF prototype; `moth` keeps a `userData.wings`
 * handle so the renderer can flap them. Add a driver by adding a builder here and a
 * matching character in characters/index.ts.
 */
import type { Group } from 'three'
import type { CharacterDef } from '../characters'
import { eyePair, flat, meshAt, toon } from './prim'
import type { Three } from './types'

type Builder = (T: Three, c: CharacterDef) => Group

const socket: Builder = (T, c) => {
  const g = new T.Group()
  meshAt(T, new T.BoxGeometry(0.6, 0.55, 0.4), toon(T, c.skin), 0, 0.32, 0, g)
  meshAt(T, new T.BoxGeometry(0.62, 0.5, 0.52), toon(T, c.skin), 0, 0.92, 0, g)
  meshAt(T, new T.BoxGeometry(0.5, 0.2, 0.06), flat(T, 0x14121a), 0, 0.95, 0.27, g)
  meshAt(T, new T.BoxGeometry(0.34, 0.06, 0.07), flat(T, 0xffd23f), 0, 0.95, 0.3, g)
  meshAt(T, new T.CylinderGeometry(0.025, 0.025, 0.34, 6), toon(T, 0x14121a), 0, 1.32, 0, g)
  meshAt(T, new T.SphereGeometry(0.07, 8, 6), flat(T, 0xffd23f), 0, 1.5, 0, g)
  meshAt(T, new T.BoxGeometry(0.74, 0.1, 0.46), toon(T, 0xffd23f), 0, 0.62, 0, g)
  // ear bolts
  const boltGeo = new T.CylinderGeometry(0.07, 0.07, 0.1, 6)
  for (const sx of [-0.36, 0.36]) {
    const b = meshAt(T, boltGeo, flat(T, 0xffd23f), sx, 0.95, 0, g)
    b.rotation.z = Math.PI / 2
  }
  return g
}

const fern: Builder = (T, c) => {
  const g = new T.Group()
  meshAt(T, new T.SphereGeometry(0.34, 12, 9), toon(T, c.skin), 0, 0.34, 0, g)
  const head = meshAt(T, new T.SphereGeometry(0.32, 12, 9), toon(T, c.skin), 0, 0.85, 0.04, g)
  head.scale.set(1.15, 0.92, 1)
  meshAt(T, new T.SphereGeometry(0.2, 10, 8), toon(T, 0xeae6cf), 0, 0.62, 0.16, g)
  const e1 = meshAt(T, new T.SphereGeometry(0.13, 10, 8), toon(T, 0xeae6cf), -0.17, 1.12, 0.1, g)
  const e2 = meshAt(T, new T.SphereGeometry(0.13, 10, 8), toon(T, 0xeae6cf), 0.17, 1.12, 0.1, g)
  meshAt(T, new T.SphereGeometry(0.06, 8, 6), flat(T, 0x14121a), 0, 0.02, 0.09, e1)
  meshAt(T, new T.SphereGeometry(0.06, 8, 6), flat(T, 0x14121a), 0, 0.02, 0.09, e2)
  // nostrils
  meshAt(T, new T.SphereGeometry(0.025, 6, 5), flat(T, 0x14121a), -0.07, 0.88, 0.34, g)
  meshAt(T, new T.SphereGeometry(0.025, 6, 5), flat(T, 0x14121a), 0.07, 0.88, 0.34, g)
  return g
}

const rex: Builder = (T, c) => {
  const g = new T.Group()
  meshAt(T, new T.BoxGeometry(0.5, 0.6, 0.42), toon(T, c.skin), 0, 0.36, 0, g)
  meshAt(T, new T.BoxGeometry(0.34, 0.4, 0.1), toon(T, c.alt), 0, 0.36, 0.22, g)
  meshAt(T, new T.BoxGeometry(0.5, 0.42, 0.5), toon(T, c.skin), 0, 0.92, 0.06, g)
  meshAt(T, new T.BoxGeometry(0.34, 0.22, 0.3), toon(T, c.skin), 0, 0.84, 0.4, g)
  eyePair(T, g, 0.16, 1.02, 0.3, 0.07)
  meshAt(T, new T.ConeGeometry(0.1, 0.22, 4), toon(T, c.alt), 0, 1.22, 0, g)
  const tail = meshAt(T, new T.ConeGeometry(0.14, 0.5, 6), toon(T, c.skin), 0, 0.34, -0.4, g)
  tail.rotation.x = Math.PI / 2.4
  // a row of teeth under the snout
  meshAt(T, new T.BoxGeometry(0.3, 0.05, 0.26), flat(T, 0xf7f1dd), 0, 0.72, 0.42, g)
  return g
}

const moth: Builder = (T, c) => {
  const g = new T.Group()
  meshAt(T, new T.SphereGeometry(0.3, 12, 9), toon(T, c.skin), 0, 0.4, 0, g)
  meshAt(T, new T.SphereGeometry(0.3, 12, 9), toon(T, c.skin), 0, 0.92, 0, g)
  meshAt(T, new T.SphereGeometry(0.34, 10, 8), toon(T, c.alt), 0, 0.62, 0, g).scale.set(1.1, 0.5, 1.05)
  eyePair(T, g, 0.13, 0.98, 0.24, 0.08)
  const wingGeo = new T.SphereGeometry(0.3, 10, 8)
  const w1 = new T.Mesh(wingGeo, toon(T, c.alt))
  w1.scale.set(0.16, 0.62, 0.95)
  w1.position.set(-0.34, 0.78, -0.18)
  w1.rotation.z = 0.45
  w1.rotation.y = -0.3
  g.add(w1)
  const w2 = w1.clone()
  w2.position.set(0.34, 0.78, -0.18)
  w2.rotation.z = -0.45
  w2.rotation.y = 0.3
  g.add(w2)
  g.userData.wings = [w1, w2]
  const a1 = meshAt(T, new T.CylinderGeometry(0.015, 0.015, 0.3, 5), toon(T, 0x14121a), -0.1, 1.26, 0.06, g)
  a1.rotation.z = 0.35
  const a2 = meshAt(T, new T.CylinderGeometry(0.015, 0.015, 0.3, 5), toon(T, 0x14121a), 0.1, 1.26, 0.06, g)
  a2.rotation.z = -0.35
  // glowing antenna tips (it IS a lamp moth)
  meshAt(T, new T.SphereGeometry(0.04, 6, 5), flat(T, 0xffd23f), -0.2, 1.4, 0.06, g)
  meshAt(T, new T.SphereGeometry(0.04, 6, 5), flat(T, 0xffd23f), 0.2, 1.4, 0.06, g)
  return g
}

const bean: Builder = (T, c) => {
  const g = new T.Group()
  meshAt(T, new T.SphereGeometry(0.3, 12, 9), toon(T, c.skin), 0, 0.36, 0, g)
  meshAt(T, new T.SphereGeometry(0.3, 12, 9), toon(T, c.skin), 0, 0.9, 0, g)
  const earGeo = new T.ConeGeometry(0.12, 0.26, 4)
  const e1 = new T.Mesh(earGeo, toon(T, c.skin))
  e1.position.set(-0.17, 1.18, 0)
  e1.rotation.z = 0.25
  g.add(e1)
  const e2 = e1.clone()
  e2.position.set(0.17, 1.18, 0)
  e2.rotation.z = -0.25
  g.add(e2)
  meshAt(T, new T.ConeGeometry(0.06, 0.14, 4), toon(T, c.alt), -0.17, 1.16, 0.03, g)
  meshAt(T, new T.ConeGeometry(0.06, 0.14, 4), toon(T, c.alt), 0.17, 1.16, 0.03, g)
  eyePair(T, g, 0.12, 0.94, 0.25, 0.06, 0xffd23f)
  meshAt(T, new T.BoxGeometry(0.4, 0.1, 0.12), toon(T, c.alt), 0, 0.6, 0.2, g)
  // void-cat tail, curled up behind
  const tail = meshAt(T, new T.CylinderGeometry(0.045, 0.07, 0.6, 6), toon(T, c.skin), 0, 0.5, -0.34, g)
  tail.rotation.x = -0.7
  meshAt(T, new T.SphereGeometry(0.07, 6, 5), toon(T, c.alt), 0, 0.78, -0.52, g)
  return g
}

const plug: Builder = (T, c) => {
  const g = new T.Group()
  meshAt(T, new T.ConeGeometry(0.42, 0.8, 9), toon(T, c.skin), 0, 0.42, 0, g)
  meshAt(T, new T.SphereGeometry(0.34, 12, 9), toon(T, c.skin), 0, 0.92, 0, g)
  eyePair(T, g, 0.13, 0.98, 0.28, 0.08, c.alt)
  meshAt(T, new T.SphereGeometry(0.05, 8, 6), flat(T, c.alt), 0, 0.8, 0.32, g)
  const armGeo = new T.SphereGeometry(0.11, 8, 6)
  const a1 = new T.Mesh(armGeo, toon(T, c.skin))
  a1.position.set(-0.4, 0.66, 0.1)
  g.add(a1)
  const a2 = a1.clone()
  a2.position.set(0.4, 0.66, 0.1)
  g.add(a2)
  return g
}

const kelzo: Builder = (T, c) => {
  // a harlequin jester with a green-hair fringe and a three-point pom hat
  const g = new T.Group()
  const hair = meshAt(T, new T.SphereGeometry(0.34, 12, 9), toon(T, 0x4caf6d), 0, 0.96, 0.02, g)
  hair.scale.set(1.06, 0.72, 1.06)
  meshAt(T, new T.SphereGeometry(0.3, 12, 9), toon(T, c.skin), 0, 0.86, 0.08, g)
  eyePair(T, g, 0.12, 0.92, 0.26, 0.055)
  meshAt(T, new T.SphereGeometry(0.055, 8, 6), flat(T, 0xe23b4f), 0, 0.82, 0.3, g) // clown nose
  const point = (color: number, x: number, rot: number) => {
    const cone = meshAt(T, new T.ConeGeometry(0.12, 0.5, 8), toon(T, color), x, 1.22, 0, g)
    cone.rotation.z = rot
    meshAt(T, new T.SphereGeometry(0.08, 8, 6), flat(T, 0xffd23f), x + Math.sin(rot) * 0.3, 1.22 + Math.cos(rot) * 0.3, 0, g)
  }
  point(0xe23b4f, -0.17, 0.6)
  point(0xffd23f, 0, 0)
  point(c.alt, 0.17, -0.6)
  meshAt(T, new T.SphereGeometry(0.3, 12, 8), toon(T, 0xffd23f), 0, 0.6, 0, g).scale.set(1.2, 0.4, 1.2) // ruffle
  return g
}

const jaira: Builder = (T, c) => {
  // a red-cap toadstool: a big spotted mushroom hat over a friendly face
  const g = new T.Group()
  const hair = meshAt(T, new T.SphereGeometry(0.34, 10, 8), toon(T, 0x2a1d18), 0, 0.92, -0.04, g)
  hair.scale.set(1.12, 0.95, 0.9)
  meshAt(T, new T.SphereGeometry(0.3, 12, 9), toon(T, c.skin), 0, 0.86, 0.06, g)
  eyePair(T, g, 0.11, 0.9, 0.25, 0.055)
  const cap = meshAt(T, new T.SphereGeometry(0.46, 14, 10), toon(T, c.paint), 0, 1.18, 0, g)
  cap.scale.set(1, 0.56, 1)
  const dot = (x: number, z: number) => meshAt(T, new T.SphereGeometry(0.07, 8, 6), flat(T, c.alt), x, 1.26, z, g)
  dot(-0.2, 0.05)
  dot(0.18, -0.06)
  dot(0.02, 0.22)
  dot(-0.05, -0.2)
  return g
}

const peacho: Builder = (T, c) => {
  // a round peach with pink hair buns, a leaf sprout, and a rosy blush
  const g = new T.Group()
  const head = meshAt(T, new T.SphereGeometry(0.34, 14, 10), toon(T, c.skin), 0, 0.9, 0, g)
  head.scale.set(1, 1.02, 1)
  meshAt(T, new T.BoxGeometry(0.04, 0.32, 0.05), toon(T, 0xf0a070), 0, 0.92, 0.32, g) // peach cleft
  meshAt(T, new T.SphereGeometry(0.16, 10, 8), toon(T, c.alt), -0.3, 1.05, -0.04, g) // hair buns
  meshAt(T, new T.SphereGeometry(0.16, 10, 8), toon(T, c.alt), 0.3, 1.05, -0.04, g)
  const fringe = meshAt(T, new T.SphereGeometry(0.34, 12, 9), toon(T, c.alt), 0, 1.0, 0.02, g)
  fringe.scale.set(1.02, 0.55, 1.02)
  meshAt(T, new T.SphereGeometry(0.3, 12, 9), toon(T, c.skin), 0, 0.86, 0.1, g)
  const leaf = meshAt(T, new T.ConeGeometry(0.1, 0.26, 5), toon(T, 0x5fe08a), 0.02, 1.3, 0, g)
  leaf.rotation.z = -0.4
  eyePair(T, g, 0.12, 0.9, 0.27, 0.06)
  meshAt(T, new T.SphereGeometry(0.055, 8, 6), flat(T, 0xff8fb0), -0.2, 0.84, 0.24, g)
  meshAt(T, new T.SphereGeometry(0.055, 8, 6), flat(T, 0xff8fb0), 0.2, 0.84, 0.24, g)
  return g
}

const BUILDERS: Record<string, Builder> = { socket, fern, rex, moth, bean, plug, kelzo, jaira, peacho }

export function buildDriver(T: Three, model: string, c: CharacterDef): Group {
  return (BUILDERS[model] ?? socket)(T, c)
}
