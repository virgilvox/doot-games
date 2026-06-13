/**
 * A small side-view kart silhouette for the cart picker, so players see the shape
 * they're choosing (a long low dart vs a chunky hauler). Browser-only 2D canvas,
 * coloured by the driver's paint + the cart's accent. Pure-ish (DOM canvas).
 */
import { getCart } from './index'

const css = (h: number): string => `#${h.toString(16).padStart(6, '0')}`

interface Shape {
  len: number
  h: number
  wheel: number
  nose: number
  wing: number
}
const SHAPES: Record<string, Shape> = {
  standard: { len: 60, h: 16, wheel: 10, nose: 8, wing: 8 },
  cruiser: { len: 72, h: 14, wheel: 12, nose: 6, wing: 9 },
  scooter: { len: 46, h: 21, wheel: 8, nose: 5, wing: 4 },
  drifter: { len: 64, h: 13, wheel: 11, nose: 8, wing: 14 },
  hauler: { len: 66, h: 23, wheel: 13, nose: 6, wing: 7 },
  dart: { len: 74, h: 12, wheel: 9, nose: 16, wing: 8 },
}

export function drawCart(cv: HTMLCanvasElement, cartId: string, paint: number, accent: number): void {
  cv.width = 112
  cv.height = 64
  const g = cv.getContext('2d')
  if (!g) return
  const s = SHAPES[cartId] ?? SHAPES.standard!
  g.clearRect(0, 0, 112, 64)
  const cx = 56
  const wy = 48
  const half = s.len / 2
  const rearX = cx - half + s.wheel * 0.7
  const frontX = cx + half - s.wheel * 0.7

  // wheels (tire + hub)
  const wheel = (x: number) => {
    g.fillStyle = '#15131a'
    g.beginPath()
    g.arc(x, wy, s.wheel, 0, 7)
    g.fill()
    g.lineWidth = 2
    g.strokeStyle = '#0b0a0f'
    g.stroke()
    g.fillStyle = '#d8d2c4'
    g.beginPath()
    g.arc(x, wy, s.wheel * 0.4, 0, 7)
    g.fill()
  }
  wheel(rearX)
  wheel(frontX)

  // rear wing
  g.fillStyle = css(accent)
  g.fillRect(cx - half - 1, wy - s.h - s.wing, 5, s.wing)
  g.fillRect(cx - half - 4, wy - s.h - s.wing - 3, 14, 5)

  // body: a low chassis with a cockpit dip and a tapered nose
  const top = wy - s.h
  g.fillStyle = css(paint)
  g.beginPath()
  g.moveTo(cx - half, wy - 2)
  g.lineTo(cx - half + 4, top)
  g.quadraticCurveTo(cx - 6, top - 4, cx, top - 2)
  g.lineTo(cx + 6, top + 2)
  g.quadraticCurveTo(cx + half - s.nose, top - 1, cx + half, wy - 6)
  g.lineTo(cx + half, wy - 1)
  g.closePath()
  g.fill()
  g.lineWidth = 3
  g.strokeStyle = '#0b0a0f'
  g.stroke()

  // accent stripe
  g.fillStyle = css(accent)
  g.fillRect(cx - half + 6, wy - s.h * 0.5, s.len - s.nose - 8, 3)

  // driver helmet in the cockpit dip
  g.fillStyle = '#14121a'
  g.beginPath()
  g.arc(cx - 2, top - 1, 7, Math.PI, 0)
  g.fill()
  g.fillStyle = css(paint)
  g.beginPath()
  g.arc(cx - 2, top - 1, 4.5, Math.PI, 0)
  g.fill()
}

/** True if this id is a known cart (so callers can guard). */
export function isCart(id: string): boolean {
  return getCart(id).id === id
}
