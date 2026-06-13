/**
 * Shared item iconography: one inline SVG per item kind, colour-coded so a glance
 * tells you what you're holding (host HUD panes + the phone controller use the
 * same art). Pure data, no DOM.
 */
import type { ItemKind } from './sim/types'

export interface ItemArt {
  /** Display name (HUD/controller tooltip copy). */
  name: string
  /** Signature colour (also used by the icon fill). */
  color: string
  /** Inline SVG markup (24x24 viewBox, self-coloured). */
  svg: string
}

export const ITEM_ART: Record<ItemKind, ItemArt> = {
  boost: {
    name: 'TURBO',
    color: '#5fe08a',
    svg: '<svg viewBox="0 0 24 24"><path fill="#5fe08a" d="M4 5l7 7-7 7V5zm9 0l7 7-7 7V5z"/></svg>',
  },
  triple: {
    name: 'TRIPLE TURBO',
    color: '#5fe08a',
    svg: '<svg viewBox="0 0 24 24"><path fill="#5fe08a" d="M2 6l5 6-5 6V6zm7 0l5 6-5 6V6zm7 0l5 6-5 6V6z"/></svg>',
  },
  wrench: {
    name: 'HOMING WRENCH',
    color: '#ffd23f',
    svg: '<svg viewBox="0 0 24 24"><path fill="#ffd23f" d="M21.2 6.4a5.4 5.4 0 0 1-7 6.9L7 20.5a2.1 2.1 0 0 1-3-3l7.2-7.2a5.4 5.4 0 0 1 6.9-7l-2.9 2.9 2.3 2.3 2.7-2.6z"/></svg>',
  },
  slick: {
    name: 'OIL SLICK',
    color: '#b48ae0',
    svg: '<svg viewBox="0 0 24 24"><path fill="#b48ae0" d="M12 2.6c3.1 4.6 6.2 7.8 6.2 11.3A6.2 6.2 0 0 1 12 20.1a6.2 6.2 0 0 1-6.2-6.2c0-3.5 3.1-6.7 6.2-11.3z"/></svg>',
  },
  volt: {
    name: 'PIT VOLT',
    color: '#9be8ff',
    svg: '<svg viewBox="0 0 24 24"><path fill="#9be8ff" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  },
}

/** Icon markup for an item kind ('' for none/unknown). */
export function itemSvg(kind: string): string {
  return (ITEM_ART as Record<string, ItemArt>)[kind]?.svg ?? ''
}

/** Display name for an item kind ('' for none/unknown). */
export function itemName(kind: string): string {
  return (ITEM_ART as Record<string, ItemArt>)[kind]?.name ?? ''
}
