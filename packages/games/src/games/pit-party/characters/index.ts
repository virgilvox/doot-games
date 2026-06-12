/**
 * Character roster. Each driver is pure data: identity, colours, a renderer model
 * id, and a partial stat bias (a "driver" in the Mario-Kart driver+vehicle model).
 * Add a character by appending here and adding a matching model builder in
 * engine/drivers.ts. Six ported from the KERF prototype.
 */
import type { KartStats } from '../sim/types'

export interface CharacterDef {
  id: string
  name: string
  blurb: string
  /** Body paint (dominant kart colour). */
  paint: number
  /** Skin / shell colour for the 3D model + portrait. */
  skin: number
  /** Accent colour (eyes, trim). */
  alt: number
  /** engine/drivers.ts builder id. */
  model: string
  bias: Partial<KartStats>
}

export const CHARACTERS: ReadonlyArray<CharacterDef> = [
  {
    id: 'socket',
    name: 'SOCKET',
    blurb: 'shop robot',
    paint: 0xf2c11e,
    skin: 0xb9c0c7,
    alt: 0x2a2f38,
    model: 'socket',
    bias: { weight: 1.05 },
  },
  {
    id: 'fern',
    name: 'FERN',
    blurb: 'pond frog',
    paint: 0x4caf6d,
    skin: 0x58c272,
    alt: 0xeae6cf,
    model: 'fern',
    bias: { accel: 1.08, handling: 1.06, miniTurbo: 1.05, weight: 0.95 },
  },
  {
    id: 'rex',
    name: 'REX',
    blurb: 'pocket rex',
    paint: 0x2aa8a0,
    skin: 0x35b8ae,
    alt: 0xf0e6c4,
    model: 'rex',
    bias: { topSpeed: 1.06, accel: 0.93, handling: 0.95, weight: 1.08 },
  },
  {
    id: 'moth',
    name: 'MOTH',
    blurb: 'lamp moth',
    paint: 0xb48ae0,
    skin: 0xcdb1ec,
    alt: 0xf2e6c8,
    model: 'moth',
    bias: { handling: 1.1, miniTurbo: 1.06, traction: 1.06, weight: 0.9 },
  },
  {
    id: 'bean',
    name: 'BEAN',
    blurb: 'void cat',
    paint: 0x554a78,
    skin: 0x241d33,
    alt: 0xff5d8f,
    model: 'bean',
    bias: { accel: 1.05, handling: 1.02, miniTurbo: 1.04 },
  },
  {
    id: 'plug',
    name: 'PLUG',
    blurb: 'pit ghost',
    paint: 0xe8e3d6,
    skin: 0xf4efe4,
    alt: 0x1a1626,
    model: 'plug',
    bias: { topSpeed: 1.04, accel: 0.95, handling: 1.03, traction: 1.05 },
  },
  {
    id: 'kelzo',
    name: 'KELZO',
    blurb: 'green-haired jester',
    paint: 0xe23b4f,
    skin: 0xf3e0d0,
    alt: 0x2f6df0,
    model: 'kelzo',
    bias: { handling: 1.06, miniTurbo: 1.1, weight: 0.9 },
  },
  {
    id: 'jaira',
    name: 'JAIRA',
    blurb: 'red toadstool',
    paint: 0xd0322f,
    skin: 0x9c6b4a,
    alt: 0xf3eee2,
    model: 'jaira',
    bias: { weight: 1.1, traction: 1.06, accel: 0.95, topSpeed: 1.02 },
  },
  {
    id: 'peacho',
    name: 'PEACHO',
    blurb: 'sweet peach sprite',
    paint: 0xffb16e,
    skin: 0xffd9c0,
    alt: 0xff8fb0,
    model: 'peacho',
    bias: { accel: 1.06, miniTurbo: 1.04, handling: 1.02 },
  },
]

const BY_ID: Record<string, CharacterDef> = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]))

export function getCharacter(id: string): CharacterDef {
  return BY_ID[id] ?? CHARACTERS[0]!
}

export const CHARACTER_IDS: ReadonlyArray<string> = CHARACTERS.map((c) => c.id)
