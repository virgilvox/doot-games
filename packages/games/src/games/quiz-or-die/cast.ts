/**
 * The QUIZ OR DIE cast as SVG markup, ported from the single-file mockup. Every
 * function returns a static SVG string built from app data only (never user input),
 * rendered with `v-html` on the host's big screen / the phone's own-doll badge.
 *
 * Shapes: blob | blobAngry | octopus | frog | pillow | shark. The dead render as a
 * ghost. The villain host has element ids (`hostRoot`, `talkMouth`, `knifeArm`,
 * `head`, `lidL`, `lidR`) that the Host component animates via scoped CSS.
 */

/** The burlap-weave + animation defs, injected once near the stage root. */
export const CAST_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <pattern id="qodWeave" width="6" height="6" patternUnits="userSpaceOnUse">
    <rect width="6" height="6" fill="none"/>
    <path d="M0 1.5H6M0 4.5H6" stroke="rgba(0,0,0,.16)" stroke-width="1"/>
    <path d="M1.5 0V6M4.5 0V6" stroke="rgba(255,255,255,.07)" stroke-width="1"/>
  </pattern>
</defs></svg>`

const eye = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1a140c"/><circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="#0a0805"/><path d="M${cx - r * 0.4} ${cy}H${cx + r * 0.4}M${cx} ${cy - r * 0.4}V${cy + r * 0.4}" stroke="#c9b487" stroke-width="${r * 0.18}"/>`
const stitchEye = (cx: number, cy: number, r: number) =>
  `<path d="M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}" stroke="#1a140c" stroke-width="2" stroke-linecap="round"/>`
const seam = `<path d="M50 16 Q53 50 50 90" stroke="rgba(0,0,0,.22)" stroke-width="1.4" stroke-dasharray="2 3" fill="none"/>`
const tex = (p: string) => `<path d="${p}" fill="url(#qodWeave)"/>`
const shadow = `<ellipse cx="50" cy="96" rx="26" ry="4" fill="rgba(0,0,0,.45)"/>`

/** A living burlap doll of the given shape + colour. */
export function doll(shape: string, color: string): string {
  let P = ''
  switch (shape) {
    case 'blobAngry': {
      const b = 'M27 52 Q20 22 50 17 Q80 22 73 52 Q78 80 70 90 Q60 86 57 93 L53 86 Q49 92 45 86 L41 93 Q38 86 30 90 Q22 80 27 52Z'
      P = `<path d="${b}" fill="${color}"/>${tex(b)}<path d="${b}" fill="none" stroke="rgba(0,0,0,.32)" stroke-width="1.5" stroke-dasharray="3 2.5"/>
        <path d="M34 40 L46 46M66 40 L54 46" stroke="#150b08" stroke-width="3" stroke-linecap="round"/>
        ${eye(42, 49, 5.5)}${eye(58, 49, 5.5)}
        <path d="M40 68 L45 64 L50 68 L55 64 L60 68" stroke="#150b08" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      break
    }
    case 'octopus': {
      const head = 'M30 44 Q30 18 50 16 Q70 18 70 44 Q70 54 64 58 L36 58 Q30 54 30 44Z'
      const legs = `<g stroke="${color}" stroke-width="9" stroke-linecap="round" fill="none">
        <path d="M40 56 Q34 76 30 92"/><path d="M47 58 Q45 80 42 94"/><path d="M53 58 Q55 80 58 94"/><path d="M60 56 Q66 76 70 92"/></g>`
      P = `${legs}<path d="${head}" fill="${color}"/>${tex(head)}<path d="${head}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1.5" stroke-dasharray="3 2.5"/>
        ${eye(42, 40, 6)}${stitchEye(60, 40, 4.5)}<path d="M44 50 Q50 47 56 50" stroke="#1a140c" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
      break
    }
    case 'frog': {
      const b = 'M22 60 Q18 42 30 38 Q26 30 34 30 Q42 30 42 38 Q50 36 58 38 Q58 30 66 30 Q74 30 70 38 Q82 42 78 60 Q82 84 72 90 Q62 86 58 92 L54 85 Q50 91 46 85 L42 92 Q38 86 28 90 Q18 84 22 60Z'
      P = `<path d="${b}" fill="${color}"/>${tex(b)}<path d="${b}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1.5" stroke-dasharray="3 2.5"/>
        <circle cx="35" cy="33" r="7" fill="${color}" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/><circle cx="65" cy="33" r="7" fill="${color}" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>
        ${eye(35, 33, 3.4)}${eye(65, 33, 3.4)}
        <path d="M34 62 Q50 72 66 62" stroke="#13100a" stroke-width="2.8" fill="none" stroke-linecap="round"/>`
      break
    }
    case 'pillow': {
      const b = 'M24 40 Q24 34 32 34 L68 34 Q76 34 76 40 L78 84 Q78 90 70 90 L30 90 Q22 90 22 84Z'
      P = `<path d="${b}" fill="${color}"/>${tex(b)}<path d="${b}" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.5" stroke-dasharray="3 2.5"/>
        <path d="M37 56 Q42 52 47 56M53 56 Q58 52 63 56" stroke="#1a140c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M45 70 Q50 73 55 70" stroke="#1a140c" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
      break
    }
    case 'shark': {
      const b = 'M30 54 Q24 26 50 22 Q60 21 64 26 L74 18 Q72 30 70 34 Q78 44 72 56 Q76 80 68 90 Q58 86 56 92 L52 85 Q48 91 44 85 L40 92 Q30 86 30 80 Q24 70 30 54Z'
      P = `<path d="${b}" fill="${color}"/>${tex(b)}<path d="${b}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1.5" stroke-dasharray="3 2.5"/>
        <circle cx="42" cy="40" r="7" fill="none" stroke="#0a0805" stroke-width="2"/>${eye(42, 40, 4)}
        ${stitchEye(60, 40, 4)}
        <path d="M36 62 H66 L62 70 L58 64 L54 70 L50 64 L46 70 L42 64 L40 68Z" fill="#efe9d8" stroke="#0a0805" stroke-width="1.4" stroke-linejoin="round"/>`
      break
    }
    default: {
      // blob
      const b = 'M28 50 Q22 22 50 18 Q78 22 72 50 Q76 78 70 88 Q60 84 58 92 L54 84 Q50 90 46 84 L42 92 Q40 84 30 88 Q24 78 28 50Z'
      P = `<path d="${b}" fill="${color}"/>${tex(b)}<path d="${b}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1.5" stroke-dasharray="3 2.5"/>
        ${eye(40, 46, 5)}${eye(60, 46, 5)}<path d="M42 64 Q50 60 58 64" stroke="#1a140c" stroke-width="2.4" fill="none" stroke-linecap="round"/>${seam}`
    }
  }
  return `<svg viewBox="0 0 100 100">${shadow}${P}</svg>`
}

/** A ghost / spectre form for the dead. */
export function ghostDoll(tint = '#cfe8e4'): string {
  return `<svg viewBox="0 0 100 100">
    <g opacity=".82">
      <path d="M30 50 Q26 22 50 20 Q74 22 70 50 Q72 78 70 92 L62 84 L56 92 L50 84 L44 92 L38 84 L30 92 Q28 78 30 50Z" fill="${tint}" opacity=".28"/>
      <path d="M34 48 Q31 26 50 24 Q69 26 66 48 Q66 60 60 64 H40 Q34 60 34 48Z" fill="#eef7f5" opacity=".55"/>
      <circle cx="42" cy="44" r="6" fill="#0a1413"/><circle cx="58" cy="44" r="6" fill="#0a1413"/>
      <path d="M48 52 L50 56 L52 52Z" fill="#0a1413"/>
      <path d="M42 62 H58 M45 62 V67 M50 62 V68 M55 62 V67" stroke="#0a1413" stroke-width="1.6"/>
      <path d="M40 70 Q50 74 60 70 M41 76 Q50 79 59 76" stroke="${tint}" stroke-width="2" fill="none" opacity=".5"/>
    </g></svg>`
}

/** A chalice, styled by index (silver/copper/gold/stone/brass/green/skull/bronze). */
export function chalice(i: number): string {
  const styles = [
    { cup: '#9aa0a6', stem: '#7d828a', g: 'M30 18 Q50 34 70 18 L66 40 Q50 50 34 40Z' },
    { cup: '#b5763e', stem: '#8a5527', g: 'M30 16 Q50 30 70 16 L65 42 Q50 52 35 42Z' },
    { cup: '#e6b522', stem: '#b88a14', g: 'M32 14 Q50 30 68 14 L64 44 Q50 56 36 44Z' },
    { cup: '#c8bfa6', stem: '#a89c80', g: 'M34 16 H66 L64 46 H36Z' },
    { cup: '#caa23a', stem: '#9c7820', g: 'M30 20 Q50 32 70 20 L66 38 Q50 46 34 38Z' },
    { cup: '#2e8b6f', stem: '#b88a14', g: 'M32 16 Q50 30 68 16 L64 42 Q50 52 36 42Z' },
    { cup: '#dfe7ea', stem: '#5fb6c9', g: 'skull' },
    { cup: '#c4a06a', stem: '#a07f48', g: 'M32 16 Q50 30 68 16 L64 44 Q50 54 36 44Z' },
  ]
  const s = styles[i % styles.length] as (typeof styles)[number]
  let bowl: string
  if (s.g === 'skull') {
    bowl = `<path d="M30 24 Q30 10 50 10 Q70 10 70 24 Q70 36 62 40 L62 48 Q50 54 38 48 L38 40 Q30 36 30 24Z" fill="${s.cup}" stroke="#9fb0b4" stroke-width="1.5"/>
      <circle cx="42" cy="26" r="4.5" fill="#1b2a2c"/><circle cx="58" cy="26" r="4.5" fill="#1b2a2c"/>
      <path d="M47 34 L50 38 L53 34Z" fill="#1b2a2c"/><path d="M40 44 H60 M44 44 V49 M50 44 V50 M56 44 V49" stroke="#1b2a2c" stroke-width="1.3"/>`
  } else {
    bowl = `<path d="${s.g}" fill="${s.cup}" stroke="rgba(0,0,0,.3)" stroke-width="1.4"/>
      <ellipse cx="50" cy="${s.g.includes('16') ? 16 : 18}" rx="20" ry="6" fill="rgba(255,255,255,.18)"/>`
  }
  return `<svg viewBox="0 0 100 100">
    <ellipse cx="50" cy="96" rx="22" ry="4" fill="rgba(0,0,0,.5)"/>
    ${bowl}
    <rect x="46" y="44" width="8" height="34" rx="2" fill="${s.stem}"/>
    <ellipse cx="50" cy="46" rx="9" ry="3" fill="${s.stem}"/>
    <path d="M34 92 Q50 80 66 92 Q50 86 34 92Z" fill="${s.stem}"/>
    <rect x="32" y="88" width="36" height="6" rx="3" fill="${s.stem}"/>
  </svg>`
}

/** A drop of green poison, shown over a poisoned cup at the reveal. */
export function poisonTok(): string {
  return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="#5fe07a" stroke="#1f7a36" stroke-width="2"/><path d="M14 14l12 12M26 14l-12 12" stroke="#0c3a18" stroke-width="3" stroke-linecap="round"/></svg>`
}

/** Pips for a die face (1..6). */
export function dieFace(n: number): string {
  const map: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
  const pos = [[20, 20], [50, 20], [80, 20], [20, 50], [50, 50], [80, 50], [20, 80], [50, 80], [80, 80]]
  return (map[n] ?? [])
    .map((i) => {
      const p = pos[i] as [number, number]
      return `<span class="pip" style="left:${p[0]}%;top:${p[1]}%;transform:translate(-50%,-50%)"></span>`
    })
    .join('')
}

/** The reaper's wheel as a pie of DIE / LIVE sectors. */
export function wheelSVG(sectors: Array<'D' | 'L'>): string {
  const n = sectors.length
  const step = 360 / n
  const cx = 100
  const cy = 100
  const r = 96
  let p = ''
  sectors.forEach((s, i) => {
    const a0 = ((i * step - 90) * Math.PI) / 180
    const a1 = (((i + 1) * step - 90) * Math.PI) / 180
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    p += `<path d="M${cx} ${cy} L${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${s === 'D' ? '#8a1414' : '#2f8f86'}" stroke="#0a0a0e" stroke-width="1.2"/>`
    const am = (((i + 0.5) * step - 90) * Math.PI) / 180
    const tx = cx + r * 0.6 * Math.cos(am)
    const ty = cy + r * 0.6 * Math.sin(am)
    p += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${s === 'D' ? '#ffe' : '#04201d'}" font-family="var(--font-horror-gore, cursive)" font-size="8" text-anchor="middle" dominant-baseline="middle" transform="rotate(${((i + 0.5) * step).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})">${s === 'D' ? 'DIE' : 'LIVE'}</text>`
  })
  return `<svg viewBox="0 0 200 200" style="width:100%;height:100%">${p}</svg>`
}

/** The cartoon-killer host, with ids the Host component animates (talk/blink/menace). */
export function villain(): string {
  return `<svg id="qodHostRoot" viewBox="0 0 200 320">
    <ellipse cx="100" cy="306" rx="62" ry="9" fill="rgba(0,0,0,.5)"/>
    <path d="M78 250 L72 300 L88 300 L92 252Z" fill="#15151c"/>
    <path d="M122 250 L128 300 L112 300 L108 252Z" fill="#15151c"/>
    <ellipse cx="80" cy="302" rx="14" ry="6" fill="#0a0a0e"/><ellipse cx="120" cy="302" rx="14" ry="6" fill="#0a0a0e"/>
    <path d="M64 150 Q100 138 136 150 L150 252 Q100 266 50 252Z" fill="#1c1c26"/>
    <g stroke="rgba(120,120,150,.18)" stroke-width="1.5">
      <path d="M74 150 L66 250"/><path d="M88 146 L84 254"/><path d="M100 145 L100 256"/><path d="M112 146 L116 254"/><path d="M126 150 L134 250"/>
    </g>
    <path d="M100 150 L80 158 L96 210 Z" fill="#0e0e14"/><path d="M100 150 L120 158 L104 210 Z" fill="#0e0e14"/>
    <path d="M96 150 L100 200 L104 150Z" fill="#d9d2bf"/>
    <path d="M100 152 l-9 8 9 7 9-7Z" fill="#c41f1f"/>
    <circle cx="100" cy="178" r="2.4" fill="#0e0e14"/><circle cx="100" cy="192" r="2.4" fill="#0e0e14"/>
    <path d="M64 156 Q44 196 56 244 Q66 244 70 240 Q66 200 80 162Z" fill="#1c1c26"/>
    <circle cx="58" cy="244" r="9" fill="#e7e0cd"/>
    <g id="qodKnifeArm">
      <path d="M136 154 Q170 150 176 110 Q168 104 160 106 Q150 140 122 160Z" fill="#1c1c26"/>
      <circle cx="170" cy="108" r="9" fill="#e7e0cd"/>
      <rect x="166" y="60" width="8" height="46" rx="3" fill="#3a2a18"/>
      <path d="M150 22 Q186 28 184 60 L156 62 Q150 44 150 22Z" fill="#cdd2d6" stroke="#8a9094" stroke-width="1.5"/>
      <path d="M156 30 Q176 36 178 56" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>
      <path d="M152 60 q4 4 0 6" fill="#c41f1f"/>
    </g>
    <rect x="92" y="120" width="16" height="22" fill="#d9d2bf"/>
    <g id="qodHead">
      <ellipse cx="100" cy="96" rx="46" ry="50" fill="#e9e2cf"/>
      <ellipse cx="100" cy="96" rx="46" ry="50" fill="url(#qodWeave)" opacity=".5"/>
      <ellipse cx="84" cy="104" rx="9" ry="6" fill="rgba(140,20,20,.22)"/><ellipse cx="116" cy="104" rx="9" ry="6" fill="rgba(140,20,20,.22)"/>
      <ellipse cx="84" cy="86" rx="9" ry="12" fill="#0a0805"/>
      <ellipse cx="116" cy="86" rx="9" ry="12" fill="#0a0805"/>
      <circle cx="86" cy="88" r="2.6" fill="#c41f1f"/><circle cx="118" cy="88" r="2.6" fill="#c41f1f"/>
      <rect id="qodLidL" x="74" y="74" width="20" height="13" fill="#e9e2cf"/>
      <rect id="qodLidR" x="106" y="74" width="20" height="13" fill="#e9e2cf"/>
      <path d="M70 116 Q100 134 130 116" stroke="#2a1c10" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M76 118 V112 M86 124 V117 M96 127 V120 M106 127 V120 M116 124 V117 M126 118 V112" stroke="#2a1c10" stroke-width="2.2"/>
      <ellipse id="qodTalkMouth" cx="100" cy="122" rx="13" ry="9" fill="#1a0c06"/>
    </g>
    <g transform="translate(0,-2)">
      <ellipse cx="100" cy="52" rx="50" ry="9" fill="#0e0e14"/>
      <path d="M68 52 L72 14 Q100 8 128 14 L132 52Z" fill="#15151c"/>
      <rect x="70" y="40" width="60" height="8" fill="#c41f1f" opacity=".85"/>
    </g>
  </svg>`
}
