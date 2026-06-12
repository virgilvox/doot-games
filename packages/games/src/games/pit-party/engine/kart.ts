/**
 * Kart visual rig. The body geometry varies by cart style (a chunky hauler vs a
 * skinny dart), the paint comes from the character, the trim accent from the cart.
 * Returns a {@link KartVisual} the renderer mutates each frame from sim state.
 */
import type { Object3D } from 'three'
import type { CharacterDef } from '../characters'
import { buildDriver } from './drivers'
import { flat, meshAt, toon } from './prim'
import type { KartVisual, Three } from './types'

interface BodyShape {
  w: number
  l: number
  h: number
  nose: number
  wheel: number
  spoiler: number
}

const BODY: Record<string, BodyShape> = {
  standard: { w: 1.5, l: 2.5, h: 0.42, nose: 0.7, wheel: 0.42, spoiler: 1.7 },
  cruiser: { w: 1.72, l: 2.9, h: 0.4, nose: 0.6, wheel: 0.46, spoiler: 1.95 },
  scooter: { w: 1.12, l: 2.1, h: 0.4, nose: 0.5, wheel: 0.36, spoiler: 1.05 },
  drifter: { w: 1.6, l: 2.5, h: 0.36, nose: 0.72, wheel: 0.44, spoiler: 2.05 },
  hauler: { w: 1.74, l: 2.7, h: 0.5, nose: 0.6, wheel: 0.5, spoiler: 1.5 },
  dart: { w: 1.28, l: 2.8, h: 0.36, nose: 1.05, wheel: 0.4, spoiler: 1.3 },
}

export interface BuildKartOpts {
  body: string
  paint: number
  accent: number
  model: string
  character: CharacterDef
}

export function buildKart(T: Three, parent: Object3D, opts: BuildKartOpts): KartVisual {
  const b: BodyShape = BODY[opts.body] ?? BODY.standard!
  const root = new T.Group()
  const rig = new T.Group()
  root.add(rig)

  const paint = toon(T, opts.paint)
  const dark = toon(T, 0x1c1924)
  const accent = toon(T, opts.accent)

  // chassis
  meshAt(T, new T.BoxGeometry(b.w, b.h, b.l), paint, 0, 0.5, 0, rig)
  const nose = meshAt(T, new T.BoxGeometry(b.w * 0.74, 0.3, b.nose), paint, 0, 0.46, b.l * 0.6, rig)
  nose.rotation.x = 0.12
  meshAt(T, new T.BoxGeometry(b.w + 0.04, 0.14, b.l * 0.44), dark, 0, 0.74, -0.1, rig) // cockpit rim
  meshAt(T, new T.BoxGeometry(0.8 * b.w, 0.5, 0.16), paint, 0, 0.86, -b.l * 0.47, rig) // spoiler post
  meshAt(T, new T.BoxGeometry(b.spoiler, 0.12, 0.5), accent, 0, 1.1, -b.l * 0.52, rig) // spoiler wing
  meshAt(T, new T.BoxGeometry(0.5, 0.12, 0.5), flat(T, 0xffd23f), 0, 0.72, b.l * 0.71, rig) // number plate
  const pipeGeo = new T.CylinderGeometry(0.09, 0.12, 0.5, 8)
  for (const sx of [-0.45, 0.45]) {
    const p = meshAt(T, pipeGeo, dark, sx, 0.62, -b.l * 0.53, rig)
    p.rotation.x = Math.PI / 2.4
  }

  // wheels
  const wheelGeo = new T.CylinderGeometry(b.wheel, b.wheel, 0.34, 12)
  const wheelMat = toon(T, 0x171420)
  const hubMat = flat(T, 0xd8d2c4)
  const wheels: Object3D[] = []
  const fronts: Object3D[] = []
  const wx = b.w * 0.57
  const wz = b.l * 0.37
  for (const [x, z, front] of [
    [-wx, wz, true],
    [wx, wz, true],
    [-wx, -wz, false],
    [wx, -wz, false],
  ] as Array<[number, number, boolean]>) {
    const pivot = new T.Group()
    pivot.position.set(x, b.wheel, z)
    rig.add(pivot)
    const w = new T.Mesh(wheelGeo, wheelMat)
    w.rotation.z = Math.PI / 2
    pivot.add(w)
    const hub = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 0.36, 8), hubMat)
    hub.rotation.z = Math.PI / 2
    pivot.add(hub)
    wheels.push(w, hub)
    if (front) fronts.push(pivot)
  }

  // driver
  const driver = buildDriver(T, opts.model, opts.character)
  driver.position.set(0, 0.62, -0.25)
  driver.scale.setScalar(0.95)
  rig.add(driver)

  // boost flame
  const flame = new T.Mesh(
    new T.ConeGeometry(0.3, 1.1, 8),
    new T.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 }),
  )
  flame.rotation.x = -Math.PI / 2
  flame.position.set(0, 0.55, -b.l * 0.78)
  flame.visible = false
  rig.add(flame)
  const flameCore = new T.Mesh(new T.ConeGeometry(0.16, 0.8, 8), new T.MeshBasicMaterial({ color: 0xfff4cf }))
  flameCore.rotation.x = -Math.PI / 2
  flameCore.position.set(0, 0.55, -b.l * 0.74)
  flameCore.visible = false
  rig.add(flameCore)

  // invuln shield
  const bubble = new T.Mesh(
    new T.SphereGeometry(2, 12, 9),
    new T.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.16, depthWrite: false }),
  )
  bubble.position.y = 0.9
  bubble.visible = false
  rig.add(bubble)

  // blob shadow (does not spin/lean)
  const blob = new T.Mesh(
    new T.CircleGeometry(1.5, 18),
    new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.015
  root.add(blob)

  parent.add(root)
  return { root, rig, wheels, fronts, driver, flame, flameCore, bubble }
}
