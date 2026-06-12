/**
 * Tiny mesh/material/geometry helpers shared by the driver + kart builders. Keeps
 * the model code terse and consistent (everything is built from primitives).
 */
import type { BufferGeometry, Material, Mesh, Object3D } from 'three'
import type { Three } from './types'

export const toon = (T: Three, color: number, extra: Record<string, unknown> = {}): Material =>
  new T.MeshLambertMaterial({ color, ...extra })

export const flat = (T: Three, color: number, extra: Record<string, unknown> = {}): Material =>
  new T.MeshBasicMaterial({ color, ...extra })

export function meshAt(
  T: Three,
  geo: BufferGeometry,
  mat: Material,
  x = 0,
  y = 0,
  z = 0,
  parent?: Object3D,
): Mesh {
  const o = new T.Mesh(geo, mat)
  o.position.set(x, y, z)
  if (parent) parent.add(o)
  return o
}

export function eyePair(
  T: Three,
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  r = 0.09,
  col = 0x14121a,
): void {
  meshAt(T, new T.SphereGeometry(r, 8, 6), flat(T, col), -x, y, z, parent)
  meshAt(T, new T.SphereGeometry(r, 8, 6), flat(T, col), x, y, z, parent)
}
