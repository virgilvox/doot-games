/**
 * Chunky 64x64 pixel-art portraits, sharing the colour identity of the 3D drivers.
 * Browser-only (2D canvas), used by the Host lobby and the phone selection screen.
 * Ported from the KERF prototype, keyed off the CHARACTERS roster.
 */
import { getCharacter } from './index'

const css = (h: number): string => `#${h.toString(16).padStart(6, '0')}`

export function drawPortrait(cv: HTMLCanvasElement, charId: string): void {
  cv.width = 64
  cv.height = 64
  const g = cv.getContext('2d')
  if (!g) return
  const c = getCharacter(charId)
  g.fillStyle = '#241f2e'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = 'rgba(255,210,63,.07)'
  g.fillRect(0, 46, 64, 18)
  if (charId === 'socket') {
    g.fillStyle = css(c.skin)
    g.fillRect(12, 14, 40, 34)
    g.fillStyle = '#14121a'
    g.fillRect(16, 24, 32, 10)
    g.fillStyle = css(0xffd23f)
    g.fillRect(22, 27, 20, 4)
    g.fillStyle = '#14121a'
    g.fillRect(30, 6, 4, 8)
    g.fillStyle = css(0xffd23f)
    g.beginPath()
    g.arc(32, 6, 3, 0, 7)
    g.fill()
    g.fillStyle = css(0xffd23f)
    g.fillRect(12, 48, 40, 5)
  } else if (charId === 'fern') {
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.ellipse(32, 36, 22, 18, 0, 0, 7)
    g.fill()
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.arc(22, 18, 9, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(42, 18, 9, 0, 7)
    g.fill()
    g.fillStyle = '#14121a'
    g.beginPath()
    g.arc(23, 19, 3.4, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(41, 19, 3.4, 0, 7)
    g.fill()
    g.strokeStyle = '#14121a'
    g.lineWidth = 2
    g.beginPath()
    g.arc(32, 40, 8, 0.3, Math.PI - 0.3)
    g.stroke()
  } else if (charId === 'rex') {
    g.fillStyle = css(c.skin)
    g.fillRect(10, 14, 44, 32)
    g.fillRect(34, 34, 26, 14)
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.moveTo(26, 14)
    g.lineTo(32, 4)
    g.lineTo(38, 14)
    g.fill()
    g.fillStyle = '#14121a'
    g.fillRect(20, 24, 6, 6)
    g.fillRect(40, 24, 6, 6)
    g.fillStyle = '#f7f1dd'
    g.beginPath()
    g.moveTo(38, 48)
    g.lineTo(42, 42)
    g.lineTo(46, 48)
    g.fill()
    g.beginPath()
    g.moveTo(48, 48)
    g.lineTo(52, 42)
    g.lineTo(56, 48)
    g.fill()
  } else if (charId === 'moth') {
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.ellipse(14, 34, 10, 20, -0.4, 0, 7)
    g.fill()
    g.beginPath()
    g.ellipse(50, 34, 10, 20, 0.4, 0, 7)
    g.fill()
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.arc(32, 30, 16, 0, 7)
    g.fill()
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.ellipse(32, 44, 16, 7, 0, 0, 7)
    g.fill()
    g.fillStyle = '#14121a'
    g.beginPath()
    g.arc(26, 28, 3.4, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(38, 28, 3.4, 0, 7)
    g.fill()
    g.strokeStyle = '#14121a'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(28, 16)
    g.lineTo(22, 6)
    g.moveTo(36, 16)
    g.lineTo(42, 6)
    g.stroke()
  } else if (charId === 'bean') {
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
    g.beginPath()
    g.arc(32, 36, 20, 0, 7)
    g.fill()
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
  } else if (charId === 'kelzo') {
    // green hair fringe + pale jester face
    g.fillStyle = css(0x4caf6d)
    g.beginPath()
    g.arc(32, 36, 18, Math.PI, 0)
    g.fill()
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.arc(32, 38, 13, 0, 7)
    g.fill()
    // three jester points with pom tips (red / yellow / blue)
    const point = (col: number, x: number) => {
      g.fillStyle = css(col)
      g.beginPath()
      g.moveTo(x - 7, 22)
      g.lineTo(x, 4)
      g.lineTo(x + 7, 22)
      g.fill()
      g.fillStyle = css(0xffd23f)
      g.beginPath()
      g.arc(x, 5, 3.5, 0, 7)
      g.fill()
    }
    point(0xe23b4f, 17)
    point(0xffd23f, 32)
    point(0x2f6df0, 47)
    g.fillStyle = '#14121a'
    g.beginPath()
    g.arc(26, 38, 2.6, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(38, 38, 2.6, 0, 7)
    g.fill()
    g.fillStyle = css(0xe23b4f)
    g.beginPath()
    g.arc(32, 44, 3, 0, 7)
    g.fill()
  } else if (charId === 'jaira') {
    // dark curls under a big spotted red toadstool cap
    g.fillStyle = '#2a1d18'
    g.beginPath()
    g.arc(32, 42, 17, 0, 7)
    g.fill()
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.arc(32, 44, 12, 0, 7)
    g.fill()
    g.fillStyle = '#14121a'
    g.beginPath()
    g.arc(27, 44, 2.4, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(37, 44, 2.4, 0, 7)
    g.fill()
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
      g.beginPath()
      g.arc(x, y, 3, 0, 7)
      g.fill()
    }
  } else if (charId === 'peacho') {
    // pink buns + fringe, peach face, leaf sprout, rosy blush
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.arc(14, 30, 8, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(50, 30, 8, 0, 7)
    g.fill()
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.arc(32, 36, 16, 0, 7)
    g.fill()
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
    g.moveTo(32, 30)
    g.lineTo(32, 46)
    g.stroke()
    g.fillStyle = '#14121a'
    g.beginPath()
    g.arc(26, 36, 2.6, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(38, 36, 2.6, 0, 7)
    g.fill()
    g.fillStyle = 'rgba(255,143,176,.65)'
    g.beginPath()
    g.arc(23, 42, 3.4, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(41, 42, 3.4, 0, 7)
    g.fill()
  } else {
    // plug
    g.fillStyle = css(c.skin)
    g.beginPath()
    g.arc(32, 28, 19, Math.PI, 0)
    g.lineTo(51, 50)
    for (let i = 0; i < 4; i++) g.lineTo(51 - 9.5 * (i + 0.5), 44 + (i % 2 ? 6 : 0))
    g.lineTo(13, 50)
    g.closePath()
    g.fill()
    g.fillStyle = css(c.alt)
    g.beginPath()
    g.arc(25, 28, 4, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(39, 28, 4, 0, 7)
    g.fill()
    g.beginPath()
    g.arc(32, 38, 2.6, 0, 7)
    g.fill()
  }
  g.strokeStyle = '#0b0a0f'
  g.lineWidth = 2
  g.strokeRect(1, 1, 62, 62)
}
