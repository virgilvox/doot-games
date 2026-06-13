/**
 * The Pit Party renderer. Lazy-imports `three` at init (client-only, graceful
 * fallback if WebGL is missing), builds the scene from a baked track + map theme,
 * and each frame mirrors the pure sim into Three meshes, then renders 1-4
 * split-screen panes with scissor/viewport multi-camera (research: one renderer,
 * one shared scene, N cameras; cap pixel ratio for split-screen).
 */
import type {
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { CharacterDef } from '../characters'
import type { MapDef } from '../maps/types'
import type { BakedTrack, Kart, RaceEvent } from '../sim/types'
import { buildKart } from './kart'
import { ParticleField } from './particles'
import { flat, meshAt } from './prim'
import { makeSky } from './textures'
import type { KartVisual, Three } from './types'
import { buildWorld } from './world'
import type { Projectile, Slick } from '../sim/items'
import type { Race } from '../sim/race'

/** One on-screen pane: which kart it follows + its normalized rect (y from bottom). */
export interface PaneView {
  kartId: string
  rect: { x: number; y: number; w: number; h: number }
}

/** What the engine needs to build one kart's look. */
export interface KartVisualSpec {
  id: string
  paint: number
  accent: number
  model: string
  body: string
  character: CharacterDef
}

interface CamRig {
  cam: PerspectiveCamera
  pos: Vector3
  init: boolean
  fov: number
}

export class PitEngine {
  private T!: Three
  private renderer!: WebGLRenderer
  private scene!: Scene
  private hemi!: HemisphereLight
  private sun!: DirectionalLight
  private cine!: PerspectiveCamera
  private kartsGroup!: Group
  private particles!: ParticleField
  private worldDispose: (() => void) | null = null
  private baked: BakedTrack | null = null

  private visuals = new Map<string, KartVisual>()
  private cams = new Map<string, CamRig>()
  private boxMeshes: { group: Group; baseY: number }[] = []
  private shots = new Map<Projectile, Mesh>()
  private oil = new Map<Slick, Mesh>()
  private W = 1280
  private H = 720
  ok = false

  async init(hostEl: HTMLElement): Promise<boolean> {
    try {
      this.T = (await import('three')) as Three
    } catch {
      return false
    }
    const T = this.T
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    hostEl.appendChild(canvas)
    try {
      this.renderer = new T.WebGLRenderer({ canvas, antialias: true })
    } catch {
      canvas.remove()
      return false
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    this.renderer.setScissorTest(true)
    this.renderer.autoClear = false
    this.W = hostEl.clientWidth || 1280
    this.H = hostEl.clientHeight || 720
    this.renderer.setSize(this.W, this.H)

    this.scene = new T.Scene()
    this.hemi = new T.HemisphereLight(0xffd9b0, 0x5a3b6b, 0.95)
    this.scene.add(this.hemi)
    this.sun = new T.DirectionalLight(0xffb36b, 1.15)
    this.sun.position.set(-180, 90, -260)
    this.scene.add(this.sun)
    this.cine = new T.PerspectiveCamera(58, this.W / this.H, 0.1, 1400)
    this.kartsGroup = new T.Group()
    this.scene.add(this.kartsGroup)
    this.particles = new ParticleField(T, this.scene)
    this.ok = true
    return true
  }

  loadMap(baked: BakedTrack, map: MapDef): void {
    if (!this.ok) return
    const T = this.T
    this.worldDispose?.()
    this.baked = baked
    const handles = buildWorld(T, this.scene, baked, map)
    this.boxMeshes = handles.itemBoxes
    this.worldDispose = handles.dispose
    // theme
    this.scene.background = makeSky(T, map.theme.sky)
    this.scene.fog = map.theme.fog
      ? new T.Fog(map.theme.fog.color, map.theme.fog.near, map.theme.fog.far)
      : null
    this.hemi.color.setHex(map.theme.hemi[0])
    this.hemi.groundColor.setHex(map.theme.hemi[1])
    this.hemi.intensity = map.theme.hemi[2]
    this.sun.color.setHex(map.theme.sun[0])
    this.sun.intensity = map.theme.sun[1]
    this.sun.position.set(map.theme.sun[2][0], map.theme.sun[2][1], map.theme.sun[2][2])
  }

  syncKarts(specs: KartVisualSpec[]): void {
    if (!this.ok) return
    const want = new Set(specs.map((s) => s.id))
    for (const [id, vis] of this.visuals) {
      if (!want.has(id)) {
        this.kartsGroup.remove(vis.root)
        this.visuals.delete(id)
        this.cams.delete(id)
      }
    }
    for (const s of specs) {
      if (this.visuals.has(s.id)) continue
      const vis = buildKart(this.T, this.kartsGroup, {
        body: s.body,
        paint: s.paint,
        accent: s.accent,
        model: s.model,
        character: s.character,
      })
      this.visuals.set(s.id, vis)
    }
  }

  resize(w: number, h: number): void {
    if (!this.ok) return
    this.W = Math.max(1, w)
    this.H = Math.max(1, h)
    this.renderer.setSize(this.W, this.H)
  }

  /** The live WebGL canvas (for the spectator stream's captureStream). */
  getCanvas(): HTMLCanvasElement | null {
    return this.ok ? this.renderer.domElement : null
  }

  /** Render the slow orbital cinematic (lobby / no race yet). */
  renderLobby(cineT: number): void {
    if (!this.ok) return
    const W = this.W
    const H = this.H
    this.renderer.setViewport(0, 0, W, H)
    this.renderer.setScissor(0, 0, W, H)
    this.renderer.clear()
    const a = cineT * 0.00008
    this.cine.position.set(Math.cos(a) * 250, 86, Math.sin(a) * 250)
    this.cine.lookAt(0, this.baked?.midY ?? 0, 20)
    this.cine.aspect = W / H
    this.cine.updateProjectionMatrix()
    this.renderer.render(this.scene, this.cine)
  }

  /** Update visuals from sim, emit particles, drive cameras, render the panes. */
  render(race: Race, views: PaneView[], events: RaceEvent[], dt: number, cineT: number): void {
    if (!this.ok) return
    for (const k of race.karts) this.syncKart(k)
    this.syncBoxes(race)
    this.syncShots(race)
    this.eventParticles(race, events)
    this.particles.update(dt)
    for (const v of views) this.updateCam(v, race, dt)
    // cap split-screen DPR a touch lower than full screen
    const wantRatio = Math.min(devicePixelRatio, views.length >= 3 ? 1.0 : views.length === 2 ? 1.25 : 1.5)
    if (Math.abs(this.renderer.getPixelRatio() - wantRatio) > 0.01) {
      this.renderer.setPixelRatio(wantRatio)
      this.renderer.setSize(this.W, this.H)
    }

    const W = this.W
    const H = this.H
    this.renderer.setViewport(0, 0, W, H)
    this.renderer.setScissor(0, 0, W, H)
    this.renderer.clear()
    if (views.length === 0) {
      const a = cineT * 0.00008
      this.cine.position.set(Math.cos(a) * 250, 86, Math.sin(a) * 250)
      this.cine.lookAt(0, this.baked?.midY ?? 0, 20)
      this.cine.aspect = W / H
      this.cine.updateProjectionMatrix()
      this.renderer.render(this.scene, this.cine)
      return
    }
    for (const v of views) {
      const rig = this.cams.get(v.kartId)
      if (!rig) continue
      const x = (v.rect.x * W) | 0
      const y = (v.rect.y * H) | 0
      const w = (v.rect.w * W) | 0
      const h = (v.rect.h * H) | 0
      this.renderer.setViewport(x, y, w, h)
      this.renderer.setScissor(x, y, w, h)
      const asp = w / Math.max(1, h)
      if (Math.abs(rig.cam.aspect - asp) > 0.001) {
        rig.cam.aspect = asp
        rig.cam.updateProjectionMatrix()
      }
      this.renderer.render(this.scene, rig.cam)
    }
  }

  private syncKart(k: Kart): void {
    const v = this.visuals.get(k.id)
    if (!v) return
    const now = performance.now()
    v.root.position.set(k.x, k.y, k.z)
    v.root.rotation.y = k.heading
    if (k.falling) {
      v.rig.rotation.z = Math.min(1.1, k.fallT * 1.6) * k.spinDir
    } else {
      let spinVis = 0
      if (k.spinT > 0) spinVis = (1 - k.spinT / 0.95) * Math.PI * 4 * k.spinDir
      const driftLean = k.drifting ? -k.driftDir * 0.16 : 0
      v.rig.rotation.y = spinVis + (k.drifting ? -k.driftDir * 0.35 : 0)
      v.rig.rotation.z = -k.steerVis * 0.1 + driftLean
    }
    for (const w of v.wheels) w.rotation.x = k.wheelSpin
    for (const f of v.fronts) f.rotation.y = k.steerVis * 0.45
    const boosting = k.boostT > 0
    v.flame.visible = boosting
    v.flameCore.visible = boosting
    if (boosting) {
      const fl = 0.8 + Math.random() * 0.5
      v.flame.scale.set(1, fl, 1)
      v.flameCore.scale.set(1, fl, 1)
    }
    v.bubble.visible = k.invulnT > 0
    if (v.bubble.visible)
      (v.bubble.material as { opacity: number }).opacity = 0.1 + Math.abs(Math.sin(now * 0.012)) * 0.12
    const wings = (v.driver.userData as { wings?: { rotation: { z: number } }[] }).wings
    if (wings) {
      const f = Math.abs(k.speed) > 2 ? Math.sin(now * 0.03) * 0.5 : Math.sin(now * 0.006) * 0.2
      wings[0]!.rotation.z = 0.45 + f
      wings[1]!.rotation.z = -0.45 - f
    }
    // continuous particles
    if (k.offroad && Math.abs(k.speed) > 6 && Math.random() < 0.5)
      this.particles.spawn('dust', k.x, k.y + Math.random() * 0.4, k.z, (Math.random() - 0.5) * 3, 1.5 + Math.random(), (Math.random() - 0.5) * 3, 1.2, 0.7, 2)
    if (k.drifting && Math.abs(k.speed) > 8 && Math.random() < 0.8) {
      const fx = Math.sin(k.heading)
      const fz = Math.cos(k.heading)
      const rx = fz
      const rz = -fx
      const bx = k.x - fx * 1.4 + rx * k.driftDir * 0.9
      const bz = k.z - fz * 1.4 + rz * k.driftDir * 0.9
      this.particles.spawn(k.driftTier >= 2 ? 'pink' : 'spark', bx, k.y + 0.25, bz, rx * k.driftDir * 4, 1.6, rz * k.driftDir * 4, 0.45, 0.35)
    }
    if (boosting && Math.random() < 0.7) {
      const fx = Math.sin(k.heading)
      const fz = Math.cos(k.heading)
      this.particles.spawn('smoke', k.x - fx * 2.1, k.y + 0.6, k.z - fz * 2.1, -fx * 4, 0.8, -fz * 4, 0.8, 0.45, 2.5)
    }
  }

  private syncBoxes(race: Race): void {
    const now = performance.now() * 0.001
    for (let i = 0; i < this.boxMeshes.length; i++) {
      const bm = this.boxMeshes[i]!
      const st = race.boxes[i]
      if (!st) continue
      bm.group.visible = st.active
      if (!st.active) continue
      const s = Math.min(1, st.t * 3)
      bm.group.scale.setScalar(s < 1 ? s : 1)
      bm.group.rotation.y += 0.027
      bm.group.rotation.x = Math.sin(st.t * 0.9) * 0.3
      bm.group.position.y = bm.baseY + Math.sin(now * 2.2 + i) * 0.3
    }
  }

  private syncShots(race: Race): void {
    // wrenches
    const live = new Set(race.projectiles)
    for (const [p, m] of this.shots) if (!live.has(p)) { this.scene.remove(m); this.shots.delete(p) }
    for (const p of race.projectiles) {
      let m = this.shots.get(p)
      if (!m) {
        m = this.wrenchMesh()
        this.scene.add(m)
        this.shots.set(p, m)
      }
      m.position.set(p.x, p.y, p.z)
      m.rotation.y = p.heading
      m.rotation.x = p.spin
    }
    const liveS = new Set(race.slicks)
    for (const [s, m] of this.oil) if (!liveS.has(s)) { this.scene.remove(m); this.oil.delete(s) }
    for (const s of race.slicks) {
      let m = this.oil.get(s)
      if (!m) {
        m = this.slickMesh()
        this.scene.add(m)
        this.oil.set(s, m)
      }
      m.position.set(s.x, s.y, s.z)
      ;(m.material as { opacity: number }).opacity = Math.min(0.85, s.life * 0.5)
    }
  }

  private wrenchMesh(): Mesh {
    const T = this.T
    const g = new T.Group()
    const m = flat(T, 0xffd23f)
    meshAt(T, new T.BoxGeometry(0.22, 0.18, 1.2), m, 0, 0, 0, g)
    const headG = new T.CylinderGeometry(0.32, 0.32, 0.18, 8)
    const h1 = meshAt(T, headG, m, 0, 0, 0.66, g)
    h1.rotation.x = Math.PI / 2
    const h2 = meshAt(T, headG, m, 0, 0, -0.66, g)
    h2.rotation.x = Math.PI / 2
    return g as unknown as Mesh
  }

  private slickMesh(): Mesh {
    const T = this.T
    const m = new T.Mesh(
      new T.CircleGeometry(1.5, 14),
      new T.MeshBasicMaterial({ color: 0x14121a, transparent: true, opacity: 0.85 }),
    )
    m.rotation.x = -Math.PI / 2
    m.position.y = 0.03
    return m
  }

  private eventParticles(race: Race, events: RaceEvent[]): void {
    for (const e of events) {
      if (e.x == null) continue
      if (e.kind === 'wall' || e.kind === 'bump' || e.kind === 'hit') {
        for (let i = 0; i < 6; i++)
          this.particles.spawn('spark', e.x, (e.y ?? 0) + Math.random() * 0.5, e.z ?? 0, (Math.random() - 0.5) * 6, 2 + Math.random() * 2, (Math.random() - 0.5) * 6, 0.5, 0.4)
      } else if (e.kind === 'throw') {
        this.particles.spawn('smoke', e.x, (e.y ?? 0), e.z ?? 0, 0, 1, 0, 0.7, 0.4)
      }
    }
    for (const e of events) {
      if (e.kind === 'zap' || e.kind === 'respawn') {
        const k = race.getKart(e.kartId)
        if (!k) continue
        for (let i = 0; i < 8; i++)
          this.particles.spawn('zap', k.x + (Math.random() - 0.5) * 2, k.y + 0.5 + Math.random(), k.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4, 2.5, (Math.random() - 0.5) * 4, 0.6, 0.5)
      }
    }
  }

  private updateCam(v: PaneView, race: Race, dt: number): void {
    const T = this.T
    const k = race.getKart(v.kartId)
    if (!k) return
    let rig = this.cams.get(v.kartId)
    if (!rig) {
      rig = { cam: new T.PerspectiveCamera(62, 1, 0.1, 1200), pos: new T.Vector3(), init: false, fov: 62 }
      this.cams.set(v.kartId, rig)
    }
    const fx = Math.sin(k.heading)
    const fz = Math.cos(k.heading)
    // speed-aware rig: pull back + rise a touch at speed (sense of pace), and bias
    // the look target into the turn (positive steer rotates toward the right
    // vector, so the offset leads the corner)
    const spN = Math.min(1.3, Math.abs(k.speed) / 34)
    const dist = 5.9 + spN * 1.7
    const tx = k.x - fx * dist
    const ty = k.y + 3.0 + spN * 0.5
    const tz = k.z - fz * dist
    if (!rig.init) {
      rig.pos.set(tx, ty, tz)
      rig.init = true
    }
    const t = 1 - Math.exp(-dt * 5.5)
    rig.pos.lerp(new T.Vector3(tx, ty, tz), t)
    rig.cam.position.copy(rig.pos)
    const rx = fz
    const rz = -fx
    const lead = k.steerVis * 1.6 * spN
    rig.cam.lookAt(k.x + fx * 6 + rx * lead, k.y + 1.3, k.z + fz * 6 + rz * lead)
    const wantFov = k.boostT > 0 ? 71 : 62
    if (Math.abs(rig.fov - wantFov) > 0.3) {
      rig.fov += (wantFov - rig.fov) * Math.min(1, dt * 6)
      rig.cam.fov = rig.fov
      rig.cam.updateProjectionMatrix()
    }
  }

  /** Draw the 2D minimap (track + karts + boxes) into a canvas context. */
  drawMinimap(cv: HTMLCanvasElement, race: Race): void {
    const baked = this.baked
    if (!baked) return
    const g = cv.getContext('2d')
    if (!g) return
    const S = cv.width
    const m = 16
    const inner = S - m * 2
    const b = baked.bounds
    const sc = inner / Math.max(b.sx, b.sz)
    const ox = m + (inner - b.sx * sc) / 2
    const oz = m + (inner - b.sz * sc) / 2
    const X = (x: number) => ox + (x - b.nx) * sc
    const Z = (z: number) => oz + (z - b.nz) * sc
    g.clearRect(0, 0, S, S)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.strokeStyle = '#3a3342'
    g.lineWidth = Math.max(5, baked.roadW * sc)
    g.beginPath()
    for (let i = 0; i < baked.n; i += 6) {
      const p = baked.samples[i]!
      i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))
    }
    g.closePath()
    g.stroke()
    g.strokeStyle = 'rgba(255,210,63,.5)'
    g.lineWidth = 1
    g.beginPath()
    for (let i = 0; i < baked.n; i += 6) {
      const p = baked.samples[i]!
      i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))
    }
    g.closePath()
    g.stroke()
    // finish line tick
    const fs = baked.samples[baked.finishIndex]!
    g.strokeStyle = '#f7f3e8'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(X(fs.x - fs.rx * (baked.roadW / 2)), Z(fs.z - fs.rz * (baked.roadW / 2)))
    g.lineTo(X(fs.x + fs.rx * (baked.roadW / 2)), Z(fs.z + fs.rz * (baked.roadW / 2)))
    g.stroke()
    for (let i = 0; i < race.boxes.length; i++) {
      const bx = race.boxes[i]!
      if (!bx.active) continue
      g.fillStyle = 'rgba(255,210,63,.85)'
      g.fillRect(X(bx.x) - 1.5, Z(bx.z) - 1.5, 3, 3)
    }
    for (const k of race.karts) {
      g.fillStyle = `#${k.paint.toString(16).padStart(6, '0')}`
      const x = X(k.x)
      const z = Z(k.z)
      if (k.human) {
        g.strokeStyle = '#f7f3e8'
        g.lineWidth = 2
        g.fillRect(x - 4, z - 4, 8, 8)
        g.strokeRect(x - 4, z - 4, 8, 8)
      } else {
        g.fillRect(x - 3, z - 3, 6, 6)
      }
    }
  }

  dispose(): void {
    this.worldDispose?.()
    try {
      this.renderer?.dispose()
    } catch {}
    this.ok = false
  }
}
