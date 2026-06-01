<script setup lang="ts">
/**
 * The Circuit Cypher 3D arena: two robots squaring off on a lit stage, adapted
 * from the rap-battle mockup into a reusable, prop-driven Vue component. It
 * renders ONLY the WebGL canvas; the game overlays its neon HUD, karaoke verse,
 * countdown, and vote/result cards on top (the same split the mockup uses between
 * `#scene` and `.layer`).
 *
 * Three.js is the documented heavy-canvas escape hatch (CLAUDE.md keeps Pixi for
 * 2D; this is genuine 3D), so it follows the same discipline as `DrawCanvas`:
 * `three` is imported lazily in `onMounted`, so it never enters the SSR bundle and
 * only loads when a battle actually starts. The whole thing is governed by the
 * host's mute/`prefers-reduced-motion` (audio + motion intensity) via props.
 *
 * Reactivity: each frame it reads the live battle props (who's performing, the
 * camera focus, the victor) and the `ArenaAudio` analyser levels passed in, so the
 * robots bob, the chest/lights pulse, the EQ wall dances, and the crowd hypes to
 * the actual beat. With no audio engine it falls back to a synthetic beat so the
 * scene still moves.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ArenaAudio } from '../audio/arena'

const props = withDefaults(
  defineProps<{
    /** The two performers (name + accent color). Left is "side 0", right "side 1". */
    left: { name: string; color?: string }
    right: { name: string; color?: string }
    /** Who is on the mic right now (raises the mic arm, leans in, jaw moves). */
    performing?: 'left' | 'right' | null
    /** Camera framing: the whole stage, one performer, or pulled back for voting. */
    focus?: 'wide' | 'left' | 'right' | 'vote'
    /** Crown + both-arms-up victory pose for the winner (results). */
    victor?: 'left' | 'right' | null
    /** The live audio engine, read each frame for beat-reactive motion. */
    audio?: ArenaAudio | null
    /** Damp all motion (the host passes prefers-reduced-motion here). */
    calm?: boolean
  }>(),
  { performing: null, focus: 'wide', victor: null, audio: null, calm: false },
)

const DEFAULT_LEFT = '#16e0ff'
const DEFAULT_RIGHT = '#ff2d9b'

const hostEl = ref<HTMLDivElement>()
let raf = 0
let disposed = false
// three.js objects are created from a lazily-imported module, so they are typed
// `any` at the boundary (same approach as DrawCanvas with Pixi).
// biome-ignore lint/suspicious/noExplicitAny: three.js loaded lazily at runtime
let THREE: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let renderer: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let scene: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let camera: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let clock: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let glowTex: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
const robots: any[] = []
// biome-ignore lint/suspicious/noExplicitAny: see above
const crowd: any[] = []
// biome-ignore lint/suspicious/noExplicitAny: see above
const eqBars: any[] = []
// biome-ignore lint/suspicious/noExplicitAny: see above
const beams: any[] = []
// biome-ignore lint/suspicious/noExplicitAny: see above
const rig: any[] = []
// biome-ignore lint/suspicious/noExplicitAny: see above
let fillLightL: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let fillLightR: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let floorGrid: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let camPos: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let camTarget: any = null

const colorOf = (side: 0 | 1) =>
  side === 0 ? (props.left.color ?? DEFAULT_LEFT) : (props.right.color ?? DEFAULT_RIGHT)

function radialTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.Texture(c)
  t.needsUpdate = true
  return t
}
// biome-ignore lint/suspicious/noExplicitAny: three color
function glowSprite(color: any, size: number) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  m.userData.billboard = true
  return m
}

function buildRobot(side: 0 | 1) {
  const colNum = new THREE.Color(colorOf(side)).getHex()
  const g = new THREE.Group()
  const accent = new THREE.MeshStandardMaterial({
    color: colNum,
    emissive: colNum,
    emissiveIntensity: 1.1,
    metalness: 0.5,
    roughness: 0.3,
  })
  const dark = new THREE.MeshStandardMaterial({ color: 0x14121c, metalness: 0.85, roughness: 0.35 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2734, metalness: 0.9, roughness: 0.4 })

  const hip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.0), metal)
  hip.position.y = 1.05
  g.add(hip)
  for (const x of [-0.45, 0.45]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 12), dark)
    leg.position.set(x, 0.5, 0)
    g.add(leg)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.8), metal)
    foot.position.set(x, 0.05, 0.05)
    g.add(foot)
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), accent)
    knee.position.set(x, 0.95, 0)
    g.add(knee)
  }

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.0), metal)
  torso.position.y = 2.2
  g.add(torso)
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), accent)
  chest.position.set(0, 2.3, 0.52)
  g.add(chest)
  const chestGlow = glowSprite(colNum, 2.2)
  chestGlow.position.set(0, 2.3, 0.62)
  g.add(chestGlow)
  for (const x of [-1.0, 1.0]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), metal)
    sh.position.set(x, 2.85, 0)
    g.add(sh)
  }

  function arm(sx: number) {
    const a = new THREE.Group()
    a.position.set(sx * 1.0, 2.85, 0)
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 1.1, 12), dark)
    up.position.y = -0.55
    a.add(up)
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), accent)
    elbow.position.y = -1.1
    a.add(elbow)
    const fore = new THREE.Group()
    fore.position.y = -1.1
    a.add(fore)
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 1.0, 12), dark)
    f.position.y = -0.5
    fore.add(f)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), metal)
    hand.position.y = -1.05
    fore.add(hand)
    a.userData.fore = fore
    a.userData.hand = hand
    return a
  }
  const armL = arm(-1)
  const armR = arm(1)
  g.add(armL)
  g.add(armR)
  armL.rotation.z = 0.25
  armR.rotation.z = -0.25

  const mic = new THREE.Group()
  const mh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.3 }),
  )
  mh.position.y = -0.25
  mic.add(mh)
  const mball = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.5 }),
  )
  mic.add(mball)
  const micGlow = glowSprite(colNum, 0.7)
  micGlow.visible = false
  mball.add(micGlow)
  mic.position.y = -1.05
  mic.rotation.x = 0.4
  armR.userData.hand.add(mic)
  armR.userData.micGlow = micGlow

  const headG = new THREE.Group()
  headG.position.y = 3.55
  g.add(headG)
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.0, 1.05), metal)
  headG.add(head)
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.34, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.4, roughness: 0.2 }),
  )
  visor.position.set(0, 0.12, 0.54)
  headG.add(visor)
  if (side === 0) {
    for (const x of [-0.26, 0.26]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.04), accent)
      e.position.set(x, 0.12, 0.57)
      headG.add(e)
      const eg = glowSprite(colNum, 1.0)
      eg.position.set(x, 0.12, 0.62)
      headG.add(eg)
    }
  } else {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.16, 0.05), accent)
    e.position.set(0, 0.12, 0.57)
    headG.add(e)
    const eg = glowSprite(colNum, 1.6)
    eg.position.set(0, 0.12, 0.62)
    headG.add(eg)
  }
  const jaw = new THREE.Group()
  jaw.position.set(0, -0.28, 0.0)
  headG.add(jaw)
  const jawBlock = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.95), metal)
  jawBlock.position.set(0, -0.16, 0.05)
  jaw.add(jawBlock)
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.16, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: colNum, emissiveIntensity: 0.6 }),
  )
  mouth.position.set(0, -0.12, 0.5)
  jaw.add(mouth)

  for (const x of [-0.7, 0.7]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 18), accent)
    cup.rotation.z = Math.PI / 2
    cup.position.set(x, 0.05, 0)
    headG.add(cup)
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 10, 24, Math.PI), metal)
  band.position.y = 0.5
  headG.add(band)

  if (side === 0) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), metal)
    ant.position.y = 1.0
    headG.add(ant)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), accent)
    tip.position.y = 1.32
    headG.add(tip)
    const tipGlow = glowSprite(colNum, 0.9)
    tipGlow.position.set(0, 1.32, 0)
    headG.add(tipGlow)
  } else {
    for (let i = 0; i < 5; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), accent)
      fin.position.set(0, 0.7, -0.3 + i * 0.15)
      fin.rotation.y = Math.PI / 4
      headG.add(fin)
    }
  }

  g.userData = {
    headG,
    jaw,
    armL,
    armR,
    micGlow: armR.userData.micGlow,
    chestGlow,
    accent,
    mouth,
    phase: Math.random() * 6.28,
    active: false,
    victory: 0,
    side,
    baseY: 0,
    mouthAmt: 0,
  }
  g.position.set(side === 0 ? -5.2 : 5.2, 0, 0)
  g.rotation.y = side === 0 ? 0.42 : -0.42
  return g
}

function buildCrowd() {
  const group = new THREE.Group()
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a12,
    metalness: 0.2,
    roughness: 0.9,
    emissive: 0x110022,
    emissiveIntensity: 0.4,
  })
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 22; i++) {
      const h = new THREE.Group()
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), headMat)
      h.add(head)
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.7, 10), headMat)
      body.position.y = -0.6
      h.add(body)
      h.position.set((i - 10.5) * 1.05 + row * 0.5, 0.2 - row * 0.15, 9 + row * 1.4)
      h.userData = { phase: Math.random() * 6.28 }
      crowd.push(h)
      group.add(h)
    }
  }
  scene.add(group)
}

function buildEQ() {
  const N = 30
  // biome-ignore lint/suspicious/noExplicitAny: three color
  const mkr = (c: any) =>
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.4 })
  const cl = new THREE.Color(colorOf(0))
  const cr = new THREE.Color(colorOf(1))
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1)
    const col = new THREE.Color().lerpColors(cl, cr, t)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.34), mkr(col))
    bar.position.set((i - (N - 1) / 2) * 0.55, 0.5, -6.5)
    eqBars.push(bar)
    scene.add(bar)
  }
}

function buildRig() {
  const truss = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.4 }),
  )
  truss.position.set(0, 9, 1)
  scene.add(truss)
  const cl = new THREE.Color(colorOf(0)).getHex()
  const cr = new THREE.Color(colorOf(1)).getHex()
  const cols = [cl, 0xffffff, cr, 0xffffff, cl, cr]
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 2.6
    const c = cols[i]
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, 0.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.4 }),
    )
    can.position.set(x, 8.7, 1)
    scene.add(can)
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 8, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    beam.position.set(x, 4.6, 1)
    beam.rotation.x = Math.PI
    beam.userData = { base: 0.06 }
    beams.push(beam)
    scene.add(beam)
    const sl = new THREE.PointLight(c, 0.4, 14, 2)
    sl.position.set(x, 8.4, 1)
    scene.add(sl)
    rig.push({ light: sl })
  }
}

function buildSpeakers() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x121019, metalness: 0.6, roughness: 0.6 })
  for (const x of [-8.5, 8.5]) {
    for (let s = 0; s < 3; s++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.6), mat)
      box.position.set(x, 0.8 + s * 1.62, -1.5)
      box.castShadow = true
      scene.add(box)
    }
  }
}

type Pres = { pos: [number, number, number]; tgt: [number, number, number] }
const PRES: Record<'wide' | 'left' | 'right' | 'vote', Pres> = {
  wide: { pos: [0, 5.0, 17], tgt: [0, 3.0, 0] },
  left: { pos: [-2.6, 4.0, 9.5], tgt: [-5.2, 3.4, 0] },
  right: { pos: [2.6, 4.0, 9.5], tgt: [5.2, 3.4, 0] },
  vote: { pos: [0, 4.6, 15], tgt: [0, 3.2, 0] },
}

// biome-ignore lint/suspicious/noExplicitAny: three object
function animRobot(r: any, dt: number, beat: number, bass: number) {
  const u = r.userData
  const damp = props.calm ? 0.25 : 1
  const bob = Math.sin(beat * Math.PI * 2 + u.phase)
  r.position.y = u.baseY + (bob * 0.04 + bass * 0.1) * (u.active ? 1.6 : 1.0) * damp
  u.headG.position.y = 3.55 + bob * 0.03 * damp
  u.headG.rotation.z = Math.sin(beat * Math.PI * 2 + u.phase) * 0.04 * damp
  u.headG.rotation.x = -bass * 0.12 * (u.active ? 1 : 0.4) * damp
  u.chestGlow.material.opacity = 0.5 + bass * 0.8
  u.accent.emissiveIntensity = 0.9 + bass * 1.2 + (u.active ? 0.6 : 0)

  const sway = Math.sin(beat * Math.PI * 2 + u.phase)
  const L = THREE.MathUtils.lerp
  if (u.active) {
    u.armR.rotation.x = L(u.armR.rotation.x, -2.15, dt * 6)
    u.armR.rotation.z = L(u.armR.rotation.z, -0.35, dt * 6)
    u.armR.userData.fore.rotation.x = L(u.armR.userData.fore.rotation.x, -0.9, dt * 6)
    u.armR.userData.micGlow.visible = true
    u.armR.userData.micGlow.material.opacity = 0.4 + Math.abs(u.mouthAmt) * 0.8
    u.armL.rotation.x = L(u.armL.rotation.x, -0.6 - Math.max(0, sway) * 0.9 * damp, dt * 8)
    u.armL.rotation.z = L(u.armL.rotation.z, 0.4 + sway * 0.2 * damp, dt * 8)
    r.rotation.y = L(r.rotation.y, u.side === 0 ? 0.55 : -0.55, dt * 3)
  } else if (u.victory) {
    u.armL.rotation.x = L(u.armL.rotation.x, -2.4 + Math.sin(beat * 6) * 0.2 * damp, dt * 6)
    u.armR.rotation.x = L(u.armR.rotation.x, -2.4 + Math.cos(beat * 6) * 0.2 * damp, dt * 6)
    u.armL.rotation.z = L(u.armL.rotation.z, 0.6, dt * 6)
    u.armR.rotation.z = L(u.armR.rotation.z, -0.6, dt * 6)
    u.armR.userData.fore.rotation.x = L(u.armR.userData.fore.rotation.x, 0, dt * 6)
    u.armR.userData.micGlow.visible = false
    r.position.y = u.baseY + Math.abs(Math.sin(beat * 4)) * 0.4 * damp
  } else {
    u.armL.rotation.x = L(u.armL.rotation.x, 0.15 + sway * 0.12 * damp, dt * 5)
    u.armR.rotation.x = L(u.armR.rotation.x, 0.15 - sway * 0.12 * damp, dt * 5)
    u.armL.rotation.z = L(u.armL.rotation.z, 0.25, dt * 5)
    u.armR.rotation.z = L(u.armR.rotation.z, -0.25, dt * 5)
    u.armR.userData.fore.rotation.x = L(u.armR.userData.fore.rotation.x, 0, dt * 5)
    u.armR.userData.micGlow.visible = false
    r.rotation.y = L(r.rotation.y, u.side === 0 ? 0.42 : -0.42, dt * 3)
  }

  // Jaw chomp: while performing, self-jitter (so it always looks alive); ease to 0 otherwise.
  const target = u.active ? 0.35 + 0.45 * Math.abs(Math.sin(performance.now() * 0.02)) : 0
  u.mouthAmt = L(u.mouthAmt, target, dt * 22)
  u.jaw.rotation.x = u.mouthAmt * 0.5
  u.mouth.material.emissiveIntensity = 0.5 + u.mouthAmt * 1.5
}

function frame() {
  if (disposed) return
  raf = requestAnimationFrame(frame)
  const dt = Math.min(clock.getDelta(), 0.05)
  const lv = props.audio?.levels() ?? { bass: 0, mid: 0, all: 0, freq: null }
  const beat = props.audio?.beatPhase() ?? performance.now() * (90 / 60) * 0.001
  const bass = lv.bass

  // camera framing
  const p = PRES[props.focus] ?? PRES.wide
  camPos.lerp(new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]), dt * 1.8)
  camTarget.lerp(new THREE.Vector3(p.tgt[0], p.tgt[1], p.tgt[2]), dt * 1.8)
  const swayAmt = props.calm ? 0 : 1
  const t = performance.now()
  camera.position
    .copy(camPos)
    .add(new THREE.Vector3(Math.sin(t * 0.0004) * 0.5 * swayAmt, Math.sin(t * 0.0006) * 0.25 * swayAmt + bass * 0.15, 0))
  camera.lookAt(camTarget)

  // spotlights track who's performing
  const lTarget = props.performing === 'left' ? 2.2 : props.victor === 'left' ? 2.4 : props.performing || props.victor ? 0.12 : 0.6
  const rTarget = props.performing === 'right' ? 2.2 : props.victor === 'right' ? 2.4 : props.performing || props.victor ? 0.12 : 0.6
  fillLightL.intensity = THREE.MathUtils.lerp(fillLightL.intensity, lTarget * (1.3 + bass * 0.8), dt * 5)
  fillLightR.intensity = THREE.MathUtils.lerp(fillLightR.intensity, rTarget * (1.3 + bass * 0.8), dt * 5)

  floorGrid.material.opacity = 0.32 + bass * 0.5

  if (lv.freq) {
    const N = eqBars.length
    for (let i = 0; i < N; i++) {
      const bin = 2 + Math.floor((i / N) * 60)
      const v = (lv.freq[bin] ?? 0) / 255
      const b = eqBars[i]
      b.scale.y = THREE.MathUtils.lerp(b.scale.y, 0.4 + v * 7, dt * 14)
      b.position.y = b.scale.y / 2
      b.material.emissiveIntensity = 0.8 + v * 2.2
    }
  }
  beams.forEach((bm, i) => {
    bm.material.opacity = bm.userData.base + lv.mid * 0.1 + (i % 2 ? bass * 0.05 : 0)
  })
  rig.forEach((r) => {
    r.light.intensity = 0.3 + lv.all * 0.8
  })

  const hype = props.performing || props.victor ? 1 : 0.5
  crowd.forEach((h) => {
    h.position.y = 0.2 + Math.sin(beat * Math.PI * 2 + h.userData.phase) * 0.12 + bass * 0.25 * hype
  })

  // robot active/victory from props
  robots[0].userData.active = props.performing === 'left'
  robots[1].userData.active = props.performing === 'right'
  robots[0].userData.victory = props.victor === 'left' ? 1 : 0
  robots[1].userData.victory = props.victor === 'right' ? 1 : 0
  robots.forEach((r) => animRobot(r, dt, beat, bass))

  // biome-ignore lint/suspicious/noExplicitAny: three object
  scene.traverse((o: any) => {
    if (o.userData?.billboard) o.quaternion.copy(camera.quaternion)
  })

  renderer.render(scene, camera)
}

function onResize() {
  if (!renderer || !camera || !hostEl.value) return
  const w = hostEl.value.clientWidth
  const h = hostEl.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

onMounted(async () => {
  const el = hostEl.value
  if (!el) return
  try {
    THREE = await import('three')
  } catch {
    return // no three: the host's overlays still tell the story
  }
  if (disposed || !hostEl.value) return
  try {
    await build(el)
  } catch {
    // No WebGL context (some headless/locked-down browsers): degrade to the DOM
    // overlays the host draws on top, rather than throwing.
  }
})

async function build(el: HTMLDivElement) {
  const w = el.clientWidth || 960
  const h = el.clientHeight || 540
  const canvas = document.createElement('canvas')
  el.appendChild(canvas)
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  renderer.shadowMap.enabled = !props.calm

  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x070314, 0.028)
  clock = new THREE.Clock()
  glowTex = radialTex()

  camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 200)
  camPos = new THREE.Vector3(0, 5, 17)
  camTarget = new THREE.Vector3(0, 2.6, 0)
  camera.position.copy(camPos)

  scene.add(new THREE.HemisphereLight(0x4a3a7a, 0x05030a, 0.5))
  scene.add(new THREE.AmbientLight(0x202030, 0.5))
  const key = new THREE.DirectionalLight(0x8888ff, 0.35)
  key.position.set(0, 12, 10)
  scene.add(key)

  fillLightL = new THREE.SpotLight(new THREE.Color(colorOf(0)).getHex(), 0, 30, 0.55, 0.5, 1.4)
  fillLightL.position.set(-5.2, 10, 5)
  fillLightL.target.position.set(-5.2, 2, 0)
  scene.add(fillLightL)
  scene.add(fillLightL.target)
  fillLightR = new THREE.SpotLight(new THREE.Color(colorOf(1)).getHex(), 0, 30, 0.55, 0.5, 1.4)
  fillLightR.position.set(5.2, 10, 5)
  fillLightR.target.position.set(5.2, 2, 0)
  scene.add(fillLightR)
  scene.add(fillLightR.target)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0a0814, metalness: 0.7, roughness: 0.35 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  floorGrid = new THREE.GridHelper(80, 60, 0x6a3aff, 0x2a1a55)
  floorGrid.material.transparent = true
  floorGrid.material.opacity = 0.5
  floorGrid.position.y = 0.02
  scene.add(floorGrid)

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 30),
    new THREE.MeshStandardMaterial({ color: 0x05030d, metalness: 0.2, roughness: 0.9 }),
  )
  wall.position.set(0, 8, -8)
  scene.add(wall)

  buildRig()
  buildEQ()
  buildSpeakers()
  buildCrowd()
  robots.push(buildRobot(0), buildRobot(1))
  robots.forEach((r) => {
    // biome-ignore lint/suspicious/noExplicitAny: three object
    r.traverse((o: any) => {
      if (o.isMesh && !o.userData.billboard && !props.calm) o.castShadow = true
    })
    scene.add(r)
  })

  window.addEventListener('resize', onResize)
  frame()
}

onBeforeUnmount(() => {
  disposed = true
  if (raf) cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
  try {
    // biome-ignore lint/suspicious/noExplicitAny: three object
    scene?.traverse((o: any) => {
      o.geometry?.dispose?.()
      const m = o.material
      if (Array.isArray(m)) m.forEach((x) => x?.dispose?.())
      else m?.dispose?.()
    })
    renderer?.dispose?.()
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <div ref="hostEl" class="rap-stage" aria-hidden="true" />
</template>

<style scoped>
.rap-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.rap-stage :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
