<script setup lang="ts">
/**
 * The Open Mic 3D standup club: one robot comedian at a mic stand in front of an
 * exposed-brick wall, under a warm spotlight, with a silhouetted crowd in the
 * foreground. The game overlays its premise/joke/vote cards on top (same split as
 * RapBattleStage between the WebGL canvas and DOM layers).
 *
 * Same heavy-canvas discipline as RapBattleStage: `three` is imported lazily in
 * `onMounted`, so it never enters the SSR bundle and only loads when a show starts;
 * no WebGL / no three degrades silently to the DOM overlays. Mute and
 * `prefers-reduced-motion` (via `calm`) govern motion intensity.
 *
 * Reactivity: each frame it reads `performing` (jaw chomps, the comedian leans into
 * the mic) and `mood` (the spotlight warms for a "kill", cools and dims for a
 * "bomb"), plus the `ArenaAudio` analyser so the crowd bobs to laughter. With no
 * audio it runs a gentle idle off a local clock so the scene still breathes.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ArenaAudio } from '../audio/arena'

const props = withDefaults(
  defineProps<{
    /** The comedian on stage (name + accent color for the chest/eyes). */
    comedian?: { name: string; color?: string } | null
    /** True while the comedian is delivering (jaw moves, leans into the mic). */
    performing?: boolean
    /** Crowd reaction: neutral idle, mid-set, a big laugh ("kill"), or silence ("bomb"). */
    mood?: 'idle' | 'perform' | 'kill' | 'bomb'
    /** The live audio engine, read each frame so the crowd bobs to laughter. */
    audio?: ArenaAudio | null
    /** Damp all motion (the host passes prefers-reduced-motion here). */
    calm?: boolean
  }>(),
  { comedian: null, performing: false, mood: 'idle', audio: null, calm: false },
)

const ACCENT = '#ffb648' // warm club amber

const hostEl = ref<HTMLDivElement>()
let raf = 0
let disposed = false
// three.js objects come from a lazily-imported module, typed `any` at the boundary
// (same approach as RapBattleStage/DrawCanvas).
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
let robot: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let spot: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
let spotCone: any = null
// biome-ignore lint/suspicious/noExplicitAny: see above
const crowd: any[] = []
// biome-ignore lint/suspicious/noExplicitAny: see above
let accentColor: any = null

const colorOf = () => props.comedian?.color ?? ACCENT

function radialTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.Texture(c)
  t.needsUpdate = true
  return t
}

/** A canvas-drawn exposed-brick texture for the back wall. */
function brickTex() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = '#241712' // mortar / dark gaps
  g.fillRect(0, 0, 512, 512)
  const bw = 64
  const bh = 30
  const gap = 5
  for (let row = 0; row * (bh + gap) < 512; row++) {
    const y = row * (bh + gap)
    const offset = row % 2 ? -bw / 2 : 0
    for (let col = -1; col * (bw + gap) < 512; col++) {
      const x = col * (bw + gap) + offset
      // Vary each brick's warmth a little so the wall is not flat.
      const v = 28 + ((row * 7 + col * 13) % 18)
      g.fillStyle = `rgb(${90 + v}, ${48 + v * 0.5}, ${40 + v * 0.4})`
      g.fillRect(x + gap, y + gap, bw, bh)
    }
  }
  const t = new THREE.Texture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(4, 2)
  t.needsUpdate = true
  return t
}

// biome-ignore lint/suspicious/noExplicitAny: three color
function glowSprite(color: any, size: number) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  m.userData.billboard = true
  return m
}

function buildComedian() {
  const colNum = new THREE.Color(colorOf()).getHex()
  accentColor = new THREE.MeshStandardMaterial({ color: colNum, emissive: colNum, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x16131c, metalness: 0.8, roughness: 0.4 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2734, metalness: 0.85, roughness: 0.45 })
  const g = new THREE.Group()

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
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.0), metal)
  torso.position.y = 2.2
  g.add(torso)
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.06), accentColor)
  chest.position.set(0, 2.3, 0.52)
  g.add(chest)
  const chestGlow = glowSprite(colNum, 2.0)
  chestGlow.position.set(0, 2.3, 0.62)
  g.add(chestGlow)
  for (const x of [-1.0, 1.0]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), metal)
    sh.position.set(x, 2.85, 0)
    g.add(sh)
  }

  // Arms: the right arm is raised to hold the mic on the stand (a relaxed standup
  // pose), the left hangs and gestures slightly while performing.
  function arm(sx: number) {
    const a = new THREE.Group()
    a.position.set(sx * 1.0, 2.85, 0)
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 1.1, 12), dark)
    up.position.y = -0.55
    a.add(up)
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), accentColor)
    elbow.position.y = -1.1
    a.add(elbow)
    const fore = new THREE.Group()
    fore.position.y = -1.1
    a.add(fore)
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 1.0, 12), dark)
    f.position.y = -0.5
    fore.add(f)
    a.userData.fore = fore
    return a
  }
  const armL = arm(-1)
  const armR = arm(1)
  g.add(armL, armR)
  armL.rotation.z = 0.2
  armR.rotation.z = -0.2

  const headG = new THREE.Group()
  headG.position.y = 3.55
  g.add(headG)
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.0, 1.05), metal)
  headG.add(head)
  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 0.05), new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.4, roughness: 0.2 }))
  visor.position.set(0, 0.12, 0.54)
  headG.add(visor)
  for (const x of [-0.26, 0.26]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.04), accentColor)
    e.position.set(x, 0.12, 0.57)
    headG.add(e)
    const eg = glowSprite(colNum, 0.9)
    eg.position.set(x, 0.12, 0.62)
    headG.add(eg)
  }
  const jaw = new THREE.Group()
  jaw.position.set(0, -0.28, 0)
  headG.add(jaw)
  const jawBlock = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.95), metal)
  jawBlock.position.set(0, -0.16, 0.05)
  jaw.add(jawBlock)
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.04), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: colNum, emissiveIntensity: 0.5 }))
  mouth.position.set(0, -0.12, 0.5)
  jaw.add(mouth)
  for (const x of [-0.7, 0.7]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 16), accentColor)
    cup.rotation.z = Math.PI / 2
    cup.position.set(x, 0.05, 0)
    headG.add(cup)
  }

  g.userData = { headG, jaw, armL, armR, mouth, chestGlow, phase: 0, mouthAmt: 0, baseY: 0 }
  g.position.set(0, 0, 0)
  return g
}

function buildMicStand() {
  const stand = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.9, roughness: 0.3 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.1, 20), metal)
  base.position.y = 0.05
  stand.add(base)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 12), metal)
  pole.position.y = 1.6
  stand.add(pole)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.5 }))
  ball.position.y = 3.2
  stand.add(ball)
  stand.position.set(1.3, 0, 1.1)
  return stand
}

function buildStool() {
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, metalness: 0.1, roughness: 0.8 })
  const stool = new THREE.Group()
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 18), wood)
  seat.position.y = 1.5
  stool.add(seat)
  for (const a of [0, 1, 2, 3]) {
    const ang = (a / 4) * Math.PI * 2 + Math.PI / 4
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), wood)
    leg.position.set(Math.cos(ang) * 0.4, 0.75, Math.sin(ang) * 0.4)
    stool.add(leg)
  }
  // A water glass on the stool.
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.1, 0.28, 14),
    new THREE.MeshStandardMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.5, metalness: 0.1, roughness: 0.1 }),
  )
  glass.position.set(0, 1.71, 0)
  stool.add(glass)
  stool.position.set(-2.6, 0, 0.6)
  return stool
}

function buildCrowd() {
  const headMat = new THREE.MeshStandardMaterial({ color: 0x070509, metalness: 0.1, roughness: 1, emissive: 0x180c04, emissiveIntensity: 0.5 })
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 12; i++) {
      const h = new THREE.Group()
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), headMat)
      h.add(head)
      const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.7, 12), headMat)
      shoulders.position.y = -0.62
      h.add(shoulders)
      h.position.set((i - 5.5) * 1.15 + row * 0.55, 0.1 - row * 0.1, 8.5 + row * 1.6)
      h.userData = { phase: (i * 1.7 + row * 3.1) % 6.28 }
      crowd.push(h)
      scene.add(h)
    }
  }
}

// biome-ignore lint/suspicious/noExplicitAny: three object
function animComedian(r: any, dt: number, idle: number, laugh: number) {
  const u = r.userData
  const damp = props.calm ? 0.25 : 1
  const L = THREE.MathUtils.lerp
  const sway = Math.sin(idle * 1.4 + u.phase)
  r.position.y = u.baseY + sway * 0.02 * damp
  u.headG.rotation.z = sway * 0.04 * damp
  u.headG.rotation.y = Math.sin(idle * 0.6) * 0.06 * damp
  u.chestGlow.material.opacity = 0.4 + laugh * 0.5

  if (props.performing) {
    // Lean toward the mic; right forearm up holding it; left hand gestures.
    u.armR.rotation.x = L(u.armR.rotation.x, -1.9, dt * 6)
    u.armR.userData.fore.rotation.x = L(u.armR.userData.fore.rotation.x, -0.7, dt * 6)
    u.armL.rotation.x = L(u.armL.rotation.x, -0.5 - Math.max(0, sway) * 0.6 * damp, dt * 6)
    r.rotation.y = L(r.rotation.y, 0.12, dt * 3)
  } else {
    u.armR.rotation.x = L(u.armR.rotation.x, -1.7, dt * 4) // rests on the mic stand
    u.armR.userData.fore.rotation.x = L(u.armR.userData.fore.rotation.x, -0.6, dt * 4)
    u.armL.rotation.x = L(u.armL.rotation.x, 0.12 + sway * 0.1 * damp, dt * 4)
    r.rotation.y = L(r.rotation.y, 0, dt * 3)
  }
  // Jaw: chomps while performing (self-jitter so it always looks alive), rests otherwise.
  const target = props.performing ? 0.32 + 0.45 * Math.abs(Math.sin(performance.now() * 0.02)) : 0
  u.mouthAmt = L(u.mouthAmt, target, dt * 22)
  u.jaw.rotation.x = u.mouthAmt * 0.5
  u.mouth.material.emissiveIntensity = 0.4 + u.mouthAmt * 1.4
}

function frame() {
  if (disposed) return
  raf = requestAnimationFrame(frame)
  const dt = Math.min(clock.getDelta(), 0.05)
  const lv = props.audio?.levels() ?? { bass: 0, mid: 0, all: 0, freq: null }
  const idle = performance.now() / 1000
  // Laughter energy: the club SFX live on `master` (post-analyser), so `all` jumps
  // on a laugh/applause; use it to bob the crowd. A "kill" mood floors it high.
  const laugh = props.mood === 'kill' ? Math.max(0.6, lv.all) : props.mood === 'bomb' ? lv.all * 0.2 : lv.all

  // Spotlight: warm + bright on a kill, cool + dim on a bomb, steady while performing.
  const warm = props.mood === 'bomb' ? 0x5577aa : colorOfSpot()
  const targetI = props.mood === 'bomb' ? 0.8 : props.performing ? 3.0 : props.mood === 'kill' ? 3.6 : 1.6
  spot.color.set(warm)
  spot.intensity = THREE.MathUtils.lerp(spot.intensity, targetI * (1 + laugh * 0.4), dt * 4)
  spotCone.material.opacity = THREE.MathUtils.lerp(spotCone.material.opacity, props.mood === 'bomb' ? 0.04 : 0.12 + laugh * 0.08, dt * 4)

  if (robot) animComedian(robot, dt, idle, laugh)

  const swayAmt = props.calm ? 0 : 1
  camera.position.x = Math.sin(idle * 0.25) * 0.4 * swayAmt
  camera.position.y = 3.4 + Math.sin(idle * 0.4) * 0.12 * swayAmt
  camera.lookAt(0, 3.0, 0)

  crowd.forEach((h) => {
    const bob = Math.sin(idle * 2.2 + h.userData.phase) * (0.06 + laugh * 0.5)
    h.position.y = (h.userData.baseY ?? h.position.y) + bob
    if (h.userData.baseY === undefined) h.userData.baseY = h.position.y - bob
  })

  // biome-ignore lint/suspicious/noExplicitAny: three object
  scene.traverse((o: any) => {
    if (o.userData?.billboard) o.quaternion.copy(camera.quaternion)
  })
  renderer.render(scene, camera)
}

function colorOfSpot(): number {
  return new THREE.Color(ACCENT).getHex()
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
    // No WebGL: degrade to the DOM overlays the host draws on top.
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
  scene.fog = new THREE.FogExp2(0x140a06, 0.03)
  clock = new THREE.Clock()
  glowTex = radialTex()

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200)
  camera.position.set(0, 3.4, 12)
  camera.lookAt(0, 3.0, 0)

  scene.add(new THREE.HemisphereLight(0x4a3320, 0x05030a, 0.5))
  scene.add(new THREE.AmbientLight(0x2a1f16, 0.6))

  // The warm key spotlight on the comedian.
  spot = new THREE.SpotLight(colorOfSpot(), 1.6, 40, 0.5, 0.6, 1.2)
  spot.position.set(0, 11, 5)
  spot.target.position.set(0, 2.5, 0)
  scene.add(spot, spot.target)
  // A faint volumetric cone for the spotlight beam.
  spotCone = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 10, 28, 1, true),
    new THREE.MeshBasicMaterial({ color: colorOfSpot(), transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  spotCone.position.set(0, 6, 2.5)
  spotCone.rotation.x = Math.PI
  scene.add(spotCone)

  // Wood stage floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x2a1c12, metalness: 0.2, roughness: 0.85 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // Exposed-brick back wall.
  const bt = brickTex()
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 18),
    new THREE.MeshStandardMaterial({ map: bt ?? undefined, color: bt ? 0xffffff : 0x3a241c, metalness: 0.05, roughness: 0.95 }),
  )
  wall.position.set(0, 6, -6)
  scene.add(wall)

  robot = buildComedian()
  // biome-ignore lint/suspicious/noExplicitAny: three object
  robot.traverse((o: any) => {
    if (o.isMesh && !o.userData.billboard && !props.calm) o.castShadow = true
  })
  scene.add(robot)
  scene.add(buildMicStand())
  scene.add(buildStool())
  buildCrowd()

  window.addEventListener('resize', onResize)
  frame()
}

// Recolor the comedian's accent when the performer changes (cheap; no rebuild).
watch(
  () => props.comedian?.color,
  (c) => {
    if (accentColor && c && THREE) accentColor.color.set(new THREE.Color(c).getHex())
  },
)

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
  <div ref="hostEl" class="comedy-stage" aria-hidden="true" />
</template>

<style scoped>
.comedy-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.comedy-stage :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
