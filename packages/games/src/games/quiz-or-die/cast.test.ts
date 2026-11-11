import { describe, expect, it } from 'vitest'
import { doll, ghostDoll, safeColor } from './cast'

// The phone renders doll()/ghostDoll() with v-html from values read off the public
// relay, so a forged colour must never reach the markup.
const FORGED = '"/><img src=x onerror="alert(document.cookie)'

describe('quiz-or-die cast colour safety', () => {
  it('safeColor keeps hex and replaces everything else', () => {
    expect(safeColor('#b53a30', '#000')).toBe('#b53a30')
    expect(safeColor('#ABC', '#000')).toBe('#ABC')
    expect(safeColor(FORGED, '#000')).toBe('#000')
    expect(safeColor('red', '#000')).toBe('#000')
    expect(safeColor(undefined, '#000')).toBe('#000')
    expect(safeColor({ toString: () => '#fff' }, '#000')).toBe('#000')
  })

  it('a forged colour never reaches doll() or ghostDoll() markup', () => {
    for (const shape of ['blob', 'blobAngry', 'octopus', 'frog', 'pillow', 'shark', '"><script>']) {
      const svg = doll(shape, FORGED)
      expect(svg).not.toContain('onerror')
      expect(svg).not.toContain('<img')
      expect(svg).not.toContain('<script')
    }
    const ghost = ghostDoll(FORGED)
    expect(ghost).not.toContain('onerror')
    expect(ghost).toContain('#cfe8e4')
  })

  it('real palette colours still render', () => {
    expect(doll('frog', '#5f8f4f')).toContain('#5f8f4f')
    expect(ghostDoll('#3f5f8f')).toContain('#3f5f8f')
    expect(ghostDoll()).toContain('#cfe8e4')
  })
})
