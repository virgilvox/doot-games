/**
 * Chunky 64x64 pixel-art portraits, sharing the colour identity of the 3D drivers.
 * Browser-only (2D canvas), used by the Host lobby and the phone selection screen.
 * Each driver gets a vignette in their own paint colour, simple cel shading, and a
 * couple of signature details so the grid reads as a cast, not clip-art.
 */
import { getCharacter } from './index'

const css = (h: number): string => `#${h.toString(16).padStart(6, '0')}`

type Ctx = CanvasRenderingContext2D

function dot(g: Ctx, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill
  g.beginPath()
  g.arc(x, y, r, 0, 7)
  g.fill()
}

function eyes(g: Ctx, lx: number, rx: number, y: number, r = 3, col = '#14121a'): void {
  dot(g, lx, y, r, col)
  dot(g, rx, y, r, col)
  // a pixel of life in each eye
  dot(g, lx + r * 0.35, y - r * 0.35, Math.max(0.8, r * 0.3), 'rgba(255,255,255,.85)')
  dot(g, rx + r * 0.35, y - r * 0.35, Math.max(0.8, r * 0.3), 'rgba(255,255,255,.85)')
}

function smile(g: Ctx, x: number, y: number, r: number, w = 2): void {
  g.strokeStyle = '#14121a'
  g.lineWidth = w
  g.beginPath()
  g.arc(x, y, r, 0.35, Math.PI - 0.35)
  g.stroke()
}

/** Shared backdrop: dark card, a glow in the driver's paint, a floor band. */
function backdrop(g: Ctx, paint: number): void {
  g.fillStyle = '#241f2e'
  g.fillRect(0, 0, 64, 64)
  const glow = g.createRadialGradient(32, 30, 4, 32, 30, 34)
  const p = css(paint)
  glow.addColorStop(0, `${p}3d`)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = `${p}2e`
  g.fillRect(0, 50, 64, 14)
  g.fillStyle = 'rgba(11,10,15,.5)'
  g.fillRect(0, 49, 64, 2)
}

export function drawPortrait(cv: HTMLCanvasElement, charId: string): void {
  cv.width = 64
  cv.height = 64
  const g = cv.getContext('2d')
  if (!g) return
  const c = getCharacter(charId)
  backdrop(g, c.paint)
  if (charId === 'socket') {
    // shop robot: steel head, glowing visor, antenna, side bolts, chin vents
    g.fillStyle = css(c.skin)
    g.fillRect(12, 14, 40, 34)
    g.fillStyle = 'rgba(11,10,15,.18)'
    g.fillRect(12, 38, 40, 10) // jaw shade
    g.fillStyle = css(c.alt)
    g.fillRect(8, 24, 4, 12) // ear bolts
    g.fillRect(52, 24, 4, 12)
    g.fillStyle = '#14121a'
    g.fillRect(16, 22, 32, 12) // visor
    g.fillStyle = css(0xffd23f)
    g.fillRect(20, 26, 7, 4) // twin eye slits
    g.fillRect(37, 26, 7, 4)
    g.fillStyle = '#14121a'
    for (let x = 22; x <= 40; x += 6) g.fillRect(x, 41, 4, 3) // chin vents
    g.fillStyle = '#14121a'
    g.fillRect(30, 5, 4, 9) // antenna
    dot(g, 32, 5, 3.4, css(0xffd23f))
    dot(g, 32, 5, 1.4, '#fff7df')
  } else if (charId === 'fern') {
    // pond frog: eye bumps on top, wide grin, belly patch, back spots
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.ellipse(32, 36, 22, 18, 0, 0, 7)
    g.fill()
    dot(g, 22, 17, 9, css(c.skin))
    dot(g, 42, 17, 9, css(c.skin))
    g.fillStyle = 'rgba(11,10,15,.14)'
    g.beginPath()
    g.ellipse(32, 44, 20, 10, 0, 0, Math.PI)
    g.fill()
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.ellipse(32, 44, 12, 8, 0, 0, 7)
    g.fill() // belly
    dot(g, 22, 18, 6.4, '#eae6cf')
    dot(g, 42, 18, 6.4, '#eae6cf')
    eyes(g, 23, 41, 19, 3.2)
    dot(g, 13, 32, 2.2, 'rgba(11,10,15,.18)')
    dot(g, 50, 30, 2.2, 'rgba(11,10,15,.18)')
    smile(g, 32, 30, 9)
    dot(g, 28, 26, 1, '#14121a')
    dot(g, 36, 26, 1, '#14121a')
  } else if (charId === 'rex') {
    // pocket rex: blocky head, snout, teeth, crest + eye ridge
    g.fillStyle = css(c.skin)
    g.fillRect(10, 14, 44, 32)
    g.fillRect(34, 34, 26, 14)
    g.fillStyle = 'rgba(11,10,15,.14)'
    g.fillRect(34, 40, 26, 8)
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.moveTo(26, 14)
    g.lineTo(32, 4)
    g.lineTo(38, 14)
    g.fill()
    g.fillStyle = 'rgba(11,10,15,.2)'
    g.fillRect(18, 20, 10, 3) // brow
    g.fillRect(38, 20, 10, 3)
    g.fillStyle = '#fff'
    dot(g, 23, 26, 4.4, '#f0e6c4')
    dot(g, 43, 26, 4.4, '#f0e6c4')
    eyes(g, 23, 43, 27, 2.6)
    g.fillStyle = '#f7f1dd'
    for (const x of [38, 48]) {
      g.beginPath()
      g.moveTo(x, 48)
      g.lineTo(x + 4, 42)
      g.lineTo(x + 8, 48)
      g.fill()
    }
    dot(g, 56, 38, 1.4, '#14121a') // nostril
  } else if (charId === 'moth') {
    // lamp moth: patterned wings, fuzzy ruff, feathered antennae
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.ellipse(14, 34, 10, 20, -0.4, 0, 7)
    g.fill()
    g.beginPath()
    g.ellipse(50, 34, 10, 20, 0.4, 0, 7)
    g.fill()
    dot(g, 13, 26, 3.4, css(c.skin)) // wing rings
    dot(g, 51, 26, 3.4, css(c.skin))
    dot(g, 11, 40, 2.4, css(c.skin))
    dot(g, 53, 40, 2.4, css(c.skin))
    g.fillStyle = css(c.skin)
    dot(g, 32, 30, 16, css(c.skin))
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.ellipse(32, 44, 16, 7, 0, 0, 7)
    g.fill() // ruff
    g.strokeStyle = css(c.alt)
    g.lineWidth = 1.6
    for (let i = 0; i < 7; i++) {
      const x = 18 + i * 4.5
      g.beginPath()
      g.moveTo(x, 40)
      g.lineTo(x + 2, 36)
      g.stroke()
    }
    eyes(g, 26, 38, 28, 3.4)
    g.strokeStyle = '#14121a'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(28, 16)
    g.lineTo(22, 6)
    g.moveTo(36, 16)
    g.lineTo(42, 6)
    g.stroke()
    dot(g, 22, 6, 2, css(0xffd23f))
    dot(g, 42, 6, 2, css(0xffd23f))
  } else if (charId === 'bean') {
    // void cat: ink silhouette, lantern eyes, pink ears, whiskers, one fang
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.moveTo(14, 22)
    g.lineTo(20, 6)
    g.lineTo(28, 18)
    g.fill()
    g.beginPath()
    g.moveTo(50, 22)
    g.lineTo(44, 6)
    g.lineTo(36, 18)
    g.fill()
    dot(g, 32, 36, 20, css(c.skin))
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.moveTo(18, 18)
    g.lineTo(21, 10)
    g.lineTo(25, 16)
    g.fill()
    g.beginPath()
    g.moveTo(46, 18)
    g.lineTo(43, 10)
    g.lineTo(39, 16)
    g.fill()
    g.fillStyle = css(0xffd23f)
    g.beginPath()
    g.ellipse(25, 34, 3.4, 5, 0, 0, 7)
    g.fill()
    g.beginPath()
    g.ellipse(39, 34, 3.4, 5, 0, 0, 7)
    g.fill()
    dot(g, 25, 33, 1.2, '#14121a')
    dot(g, 39, 33, 1.2, '#14121a')
    g.strokeStyle = 'rgba(240,236,223,.6)'
    g.lineWidth = 1.4
    g.beginPath()
    g.moveTo(10, 40)
    g.lineTo(20, 42)
    g.moveTo(10, 46)
    g.lineTo(20, 45)
    g.moveTo(54, 40)
    g.lineTo(44, 42)
    g.moveTo(54, 46)
    g.lineTo(44, 45)
    g.stroke()
    g.fillStyle = '#f0ecdf'
    g.beginPath()
    g.moveTo(30, 47)
    g.lineTo(32, 51)
    g.lineTo(34, 47)
    g.fill() // fang
    dot(g, 44, 26, 1.2, 'rgba(255,93,143,.9)') // a fleck of the void
  } else if (charId === 'kelzo') {
    // jester: three pom points, green fringe, diamond ruffle, clown nose + grin
    const point = (col: number, x: number) => {
      g.fillStyle = css(col)
      g.beginPath()
      g.moveTo(x - 7, 22)
      g.lineTo(x, 4)
      g.lineTo(x + 7, 22)
      g.fill()
      dot(g, x, 5, 3.5, css(0xffd23f))
    }
    point(0xe23b4f, 17)
    point(0xffd23f, 32)
    point(0x2f6df0, 47)
    g.fillStyle = css(0x4caf6d)
    g.beginPath()
    g.arc(32, 36, 18, Math.PI, 0)
    g.fill()
    dot(g, 32, 38, 13, css(c.skin))
    g.fillStyle = 'rgba(11,10,15,.1)'
    g.beginPath()
    g.ellipse(32, 44, 11, 6, 0, 0, Math.PI)
    g.fill()
    eyes(g, 26, 38, 37, 2.6)
    dot(g, 32, 44, 3, css(0xe23b4f))
    smile(g, 32, 41, 7)
    // diamond ruffle along the bottom
    for (let i = 0; i < 5; i++) {
      const x = 12 + i * 10
      g.fillStyle = i % 2 ? css(0xffd23f) : css(0xe23b4f)
      g.beginPath()
      g.moveTo(x, 56)
      g.lineTo(x + 5, 51)
      g.lineTo(x + 10, 56)
      g.lineTo(x + 5, 61)
      g.fill()
    }
  } else if (charId === 'jaira') {
    // toadstool: spotted cap with a shine, curls, freckles + smile
    g.fillStyle = '#2a1d18'
    dot(g, 32, 42, 17, '#2a1d18')
    dot(g, 32, 44, 12, css(c.skin))
    g.fillStyle = 'rgba(11,10,15,.12)'
    g.beginPath()
    g.ellipse(32, 50, 9, 5, 0, 0, Math.PI)
    g.fill()
    eyes(g, 27, 37, 43, 2.4)
    smile(g, 32, 46, 5, 1.6)
    dot(g, 23, 47, 1.1, 'rgba(11,10,15,.35)')
    dot(g, 41, 47, 1.1, 'rgba(11,10,15,.35)')
    g.fillStyle = css(c.paint)
    g.beginPath()
    g.moveTo(6, 30)
    g.quadraticCurveTo(32, 0, 58, 30)
    g.quadraticCurveTo(32, 22, 6, 30)
    g.fill()
    g.fillStyle = css(c.alt)
    for (const [x, y] of [
      [18, 22],
      [32, 16],
      [45, 22],
      [26, 26],
      [40, 27],
    ] as Array<[number, number]>) {
      dot(g, x, y, 3, css(c.alt))
    }
    g.strokeStyle = 'rgba(255,255,255,.5)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(30, 26, 16, -2.4, -1.7)
    g.stroke() // cap shine
  } else if (charId === 'peacho') {
    // peach sprite: buns + fringe, leaf, cleft, blush + smile
    dot(g, 14, 30, 8, css(c.alt))
    dot(g, 50, 30, 8, css(c.alt))
    dot(g, 12, 27, 2.4, 'rgba(255,255,255,.4)')
    dot(g, 48, 27, 2.4, 'rgba(255,255,255,.4)')
    dot(g, 32, 36, 16, css(c.skin))
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.arc(32, 30, 16, Math.PI, 0)
    g.fill()
    g.fillStyle = css(0x5fe08a)
    g.beginPath()
    g.ellipse(34, 14, 4, 7, 0.5, 0, 7)
    g.fill()
    g.strokeStyle = css(0xf0a070)
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(32, 32)
    g.lineTo(32, 46)
    g.stroke()
    eyes(g, 26, 38, 36, 2.6)
    smile(g, 32, 41, 5, 1.6)
    dot(g, 23, 42, 3.4, 'rgba(255,143,176,.65)')
    dot(g, 41, 42, 3.4, 'rgba(255,143,176,.65)')
  } else {
    // plug, the pit ghost: sheet with a wavy hem, glow eyes, blush, a wisp
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.arc(32, 28, 19, Math.PI, 0)
    g.lineTo(51, 50)
    for (let i = 0; i < 4; i++) g.lineTo(51 - 9.5 * (i + 0.5), 44 + (i % 2 ? 6 : 0))
    g.lineTo(13, 50)
    g.closePath()
    g.fill()
    g.fillStyle = 'rgba(11,10,15,.07)'
    g.beginPath()
    g.arc(32, 30, 19, 0.3, Math.PI - 0.3)
    g.fill()
    dot(g, 25, 28, 4, css(c.alt))
    dot(g, 39, 28, 4, css(c.alt))
    dot(g, 26, 27, 1.3, '#9be8ff')
    dot(g, 40, 27, 1.3, '#9be8ff')
    dot(g, 32, 38, 2.6, css(c.alt))
    dot(g, 18, 34, 2.6, 'rgba(255,93,143,.4)')
    dot(g, 46, 34, 2.6, 'rgba(255,93,143,.4)')
    g.strokeStyle = 'rgba(244,239,228,.7)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(50, 16)
    g.quadraticCurveTo(56, 12, 54, 6)
    g.stroke() // wisp
  }
  g.strokeStyle = '#0b0a0f'
  g.lineWidth = 2
  g.strokeRect(1, 1, 62, 62)
}
