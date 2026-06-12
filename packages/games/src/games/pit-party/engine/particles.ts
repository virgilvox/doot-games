/**
 * A fixed-size sprite particle pool (dust, sparks, drift flares, boost smoke, zap).
 * Recycled round-robin so it never allocates during a race. Ported from KERF.
 */
import type { Scene, Sprite, SpriteMaterial } from 'three'
import type { Three } from './types'

interface P {
  s: Sprite
  life: number
  max: number
  vx: number
  vy: number
  vz: number
  grow: number
  floor: number
}

const COLORS: Record<string, string> = {
  dust: '#caa07a',
  spark: '#ffd23f',
  pink: '#ff5d8f',
  smoke: '#6b6276',
  zap: '#9be8ff',
}

export class ParticleField {
  private pool: P[] = []
  private mats: Record<string, SpriteMaterial> = {}
  private cursor = 0

  constructor(
    private T: Three,
    scene: Scene,
    max = 220,
  ) {
    for (const [k, col] of Object.entries(COLORS)) this.mats[k] = this.dot(col)
    for (let i = 0; i < max; i++) {
      const s = new T.Sprite(this.mats.dust)
      s.visible = false
      scene.add(s)
      this.pool.push({ s, life: 0, max: 0, vx: 0, vy: 0, vz: 0, grow: 0, floor: 0 })
    }
  }

  private dot(color: string): SpriteMaterial {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')!
    g.fillStyle = color
    g.beginPath()
    g.arc(16, 16, 14, 0, 7)
    g.fill()
    const t = new this.T.CanvasTexture(c)
    t.colorSpace = this.T.SRGBColorSpace
    return new this.T.SpriteMaterial({ map: t, transparent: true, depthWrite: false })
  }

  spawn(
    kind: string,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size = 1,
    life = 0.6,
    grow = 0,
  ): void {
    const p = this.pool[this.cursor]!
    this.cursor = (this.cursor + 1) % this.pool.length
    p.s.material = this.mats[kind] ?? this.mats.dust!
    p.s.visible = true
    p.s.position.set(x, y, z)
    p.s.scale.setScalar(size)
    p.vx = vx
    p.vy = vy
    p.vz = vz
    p.life = p.max = life
    p.grow = grow
    p.floor = y - 0.6
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.s.visible) continue
      p.life -= dt
      if (p.life <= 0) {
        p.s.visible = false
        continue
      }
      p.s.position.x += p.vx * dt
      p.s.position.y += p.vy * dt
      p.s.position.z += p.vz * dt
      p.vy -= 4 * dt
      if (p.vy < 0 && p.s.position.y < p.floor) {
        p.s.position.y = p.floor
        p.vy = 0
      }
      const k = p.life / p.max
      ;(p.s.material as SpriteMaterial).opacity = k
      if (p.grow) p.s.scale.addScalar(p.grow * dt)
    }
  }
}
