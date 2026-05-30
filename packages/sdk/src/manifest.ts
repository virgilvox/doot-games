/**
 * The game manifest: identity and declared capabilities of a game type. A
 * plugin (first-party or external) is validated against this schema with Zod
 * before it is trusted or registered. See PRD section 8.1.
 */
import { z } from 'zod'

/** Capabilities a game type can declare so the shell can adapt. */
export const CAPABILITIES = [
  'timer',
  'untimed',
  'images',
  'music',
  'drawing',
  'teams',
  'spectators',
] as const

export const capabilitySchema = z.enum(CAPABILITIES)
export type Capability = z.infer<typeof capabilitySchema>

export const gameManifestSchema = z.object({
  /** Reverse-dns or short slug, globally unique. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** Semver. */
  version: z.string().min(1),
  description: z.string().default(''),
  author: z.string().default(''),
  /** URL or packaged asset. */
  icon: z.string().optional(),
  capabilities: z.array(capabilitySchema).default([]),
  minPlayers: z.number().int().positive().optional(),
  maxPlayers: z.number().int().positive().optional(),
  /** A first-party, ready-to-play "Game From Doot": a curated, deeply replayable
   *  game (it ships a content pool via `buildConfig`) surfaced as Host-now on
   *  Explore/Home, distinct from an editor template. Omitted = not a flagship. */
  flagship: z.boolean().optional(),
})

export type GameManifest = z.infer<typeof gameManifestSchema>
