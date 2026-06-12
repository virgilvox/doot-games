/**
 * Shared view + player types used by the block model (see `block.ts`).
 */
import type { Component } from 'vue'

/** A player as scoring sees them (only those eligible/present are passed in). */
export interface ScorePlayer {
  id: string
  name: string
  joinedAtIndex: number
  /** The team this player picked (or was assigned) in the lobby, when teams are
   *  on. Ephemeral, set on the relay like `name`. Absent when not playing in teams.
   *  Blocks ignore it; the generic renderer rolls per-player scores into team
   *  totals (it never changes how a block scores a player). */
  team?: string
}

/** The three (plus two optional) views a game renders. Games usually let the
 *  generic renderer build these from blocks; a full-custom game overrides them. */
export interface GameComponents {
  /** Big screen; switches on round state. */
  Host: Component
  /** Phone input surface. */
  Player: Component
  /** The animated results page. */
  Results: Component
  /** Optional; auto-generated from a block's `contentSchema` when omitted. */
  Editor?: Component
  /** Optional lobby customization. */
  Lobby?: Component
  /** Optional spectator view for someone who opens the room to watch (not play).
   *  When omitted, the generic audience board is shown; a custom-flow game like
   *  Retro Arcade overrides this to show its live stream instead. */
  Audience?: Component
}

/** A registry entry pairs a loaded plugin with its source. */
export interface PluginRegistration {
  source: 'builtin' | 'url'
  sourceUrl?: string
}
