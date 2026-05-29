/**
 * Shared view + player types used by the block model (see `block.ts`).
 */
import type { Component } from 'vue'

/** A player as scoring sees them (only those eligible/present are passed in). */
export interface ScorePlayer {
  id: string
  name: string
  joinedAtIndex: number
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
}

/** A registry entry pairs a loaded plugin with its source. */
export interface PluginRegistration {
  source: 'builtin' | 'url'
  sourceUrl?: string
}
