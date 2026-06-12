/**
 * Procedural canvas textures for the road surfaces and skies. All generated at
 * load, no image assets. Ported + extended from the KERF prototype (added the neon
 * and ember road surfaces).
 */
import type { Texture } from 'three'
import type { SkyDef } from '../maps/types'
import type { Three } from './types'

function roadKiln(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#2b2530'
  g.fillRect(0, 0, 128, 64)
  g.fillStyle = '#3a3342'
  for (let i = 0; i < 240; i++) g.fillRect((Math.random() * 128) | 0, (Math.random() * 64) | 0, 2, 2)
  g.fillStyle = '#e9b32e'
  g.fillRect(0, 0, 128, 5)
  g.fillRect(0, 59, 128, 5)
  g.fillStyle = '#d8d2c4'
  g.fillRect(0, 29, 52, 6)
  return c
}

function roadSprue(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#1b1820'
  g.fillRect(0, 0, 128, 64)
  g.fillStyle = '#262230'
  for (let i = 0; i < 200; i++) g.fillRect((Math.random() * 128) | 0, (Math.random() * 64) | 0, 2, 2)
  g.fillStyle = '#3a3342'
  for (let x = 8; x < 128; x += 16) {
    g.fillRect(x, 8, 2, 2)
    g.fillRect(x + 8, 54, 2, 2)
  }
  g.fillStyle = '#ff9b2e'
  g.fillRect(0, 0, 128, 4)
  g.fillRect(0, 60, 128, 4)
  g.fillStyle = '#7a4a14'
  g.fillRect(0, 30, 40, 4)
  return c
}

function roadPrism(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  const bands = ['#ff5d8f', '#ff9b2e', '#ffd23f', '#5fe08a', '#4ec3e0', '#b48ae0']
  const bh = 64 / bands.length
  bands.forEach((col, i) => {
    g.fillStyle = col
    g.fillRect(0, i * bh, 128, bh + 1)
  })
  g.fillStyle = 'rgba(11,10,15,.25)'
  for (let i = 1; i < bands.length; i++) g.fillRect(0, i * bh - 1, 128, 2)
  g.fillStyle = '#f7f3e8'
  g.fillRect(0, 0, 128, 3)
  g.fillRect(0, 61, 128, 3)
  g.fillStyle = 'rgba(255,255,255,.5)'
  for (let i = 0; i < 40; i++) g.fillRect((Math.random() * 128) | 0, (Math.random() * 64) | 0, 1, 1)
  return c
}

function roadNeon(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#0c0a18'
  g.fillRect(0, 0, 128, 64)
  g.fillStyle = '#161029'
  for (let i = 0; i < 160; i++) g.fillRect((Math.random() * 128) | 0, (Math.random() * 64) | 0, 2, 1)
  // wet sheen streaks
  g.fillStyle = 'rgba(78,195,224,.18)'
  for (let x = 0; x < 128; x += 6) g.fillRect(x, 0, 1, 64)
  g.fillStyle = '#4ec3e0'
  g.fillRect(0, 1, 128, 3)
  g.fillStyle = '#ff5d8f'
  g.fillRect(0, 60, 128, 3)
  // centre dashes
  g.fillStyle = '#ffd23f'
  for (let x = 6; x < 128; x += 26) g.fillRect(x, 30, 14, 4)
  return c
}

function roadEmber(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#221013'
  g.fillRect(0, 0, 128, 64)
  // glowing cracks
  g.strokeStyle = 'rgba(255,106,46,.5)'
  g.lineWidth = 1
  for (let i = 0; i < 10; i++) {
    g.beginPath()
    let x = Math.random() * 128
    let y = 6 + Math.random() * 52
    g.moveTo(x, y)
    for (let s = 0; s < 3; s++) {
      x += (Math.random() - 0.5) * 26
      y += (Math.random() - 0.5) * 12
      g.lineTo(x, y)
    }
    g.stroke()
  }
  g.fillStyle = '#ff6a2e'
  g.fillRect(0, 0, 128, 4)
  g.fillRect(0, 60, 128, 4)
  g.fillStyle = '#5a2a18'
  g.fillRect(0, 30, 46, 4)
  return c
}

const ROAD: Record<string, () => HTMLCanvasElement> = {
  kiln: roadKiln,
  sprue: roadSprue,
  prism: roadPrism,
  neon: roadNeon,
  ember: roadEmber,
}

export function makeRoadTexture(T: Three, kind: string): Texture {
  const fn = ROAD[kind] ?? roadKiln
  const tex = new T.CanvasTexture(fn())
  tex.wrapS = T.RepeatWrapping
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

export function makeSky(T: Three, def: SkyDef): Texture {
  if (def === 'stars') return starSky(T)
  const c = document.createElement('canvas')
  c.width = 2
  c.height = 512
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, 512)
  for (const [pos, col] of def.stops) grd.addColorStop(pos, col)
  g.fillStyle = grd
  g.fillRect(0, 0, 2, 512)
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

function starSky(T: Three): Texture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, 512)
  grd.addColorStop(0, '#05030f')
  grd.addColorStop(0.6, '#120a2e')
  grd.addColorStop(1, '#251243')
  g.fillStyle = grd
  g.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 1024
    const y = Math.random() * 470
    const s = Math.random() < 0.12 ? 2 : 1
    g.fillStyle = `rgba(255,255,255,${(0.3 + Math.random() * 0.7).toFixed(2)})`
    g.fillRect(x, y, s, s)
  }
  const tints = ['#9be8ff', '#ff5d8f', '#ffd23f']
  for (let i = 0; i < 26; i++) {
    g.fillStyle = tints[i % 3]!
    g.fillRect(Math.random() * 1024, Math.random() * 440, 2, 2)
  }
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

/** Black/white checker for the finish-line strip. */
export function checkerTexture(T: Three): Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 16
  const g = c.getContext('2d')!
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#14121a' : '#efe9da'
      g.fillRect(x * 8, y * 8, 8, 8)
    }
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

/** Hazard chevron stripe for the gate banner + corner walls. */
export function hazardTexture(T: Three, w = 128, h = 32): Texture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#ffd23f'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#0b0a0f'
  for (let x = -h; x < w + h; x += h) {
    g.beginPath()
    g.moveTo(x, h)
    g.lineTo(x + h / 2, 0)
    g.lineTo(x + h, 0)
    g.lineTo(x + h / 2, h)
    g.fill()
  }
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}
