<script setup lang="ts">
/**
 * A small inline-SVG icon set (feather-style strokes + a couple of filled glyphs)
 * so the app never renders emoji. `currentColor` drives the color, so an icon
 * inherits its surrounding text color. Add new glyphs to ICONS as needed.
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: IconName; size?: number | string }>(), { size: 20 })

type IconName = 'mic' | 'volume' | 'mute' | 'skip' | 'cheer' | 'crown' | 'cpu' | 'mc' | 'bell' | 'eye' | 'mask' | 'close' | 'flag'

interface Glyph {
  inner: string
  /** Filled glyph (no stroke) vs. the default stroked outline. */
  fill?: boolean
}

const ICONS: Record<IconName, Glyph> = {
  mic: {
    inner:
      '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>',
  },
  bell: {
    inner:
      '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  },
  volume: {
    inner:
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  },
  mute: {
    inner:
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
  },
  skip: {
    inner: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  },
  cheer: {
    // a flame, filled for punch
    inner:
      'M12 2c.4 2.6 2.4 3.8 3.4 5.4 1 1.6 1.6 3 1.6 4.6a5 5 0 1 1-10 0c0-1.2.4-2.2 1-3 .2 1 .9 1.7 1.8 1.7 1.2 0 1.8-.9 1.6-2.4-.2-1.7.2-3.6 .6-6.3z',
    fill: true,
  },
  crown: {
    inner: 'M3 18l1.6-10 4.7 4.4L12 4l2.7 8.4 4.7-4.4L21 18z M4 19h16v2H4z',
    fill: true,
  },
  cpu: {
    inner:
      '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  },
  mc: {
    // broadcast / on-air, for the delegated MC
    inner:
      '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>',
  },
  eye: {
    // spotting / accusing, for Faker's accuse round
    inner: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  },
  mask: {
    // incognito glasses, for the faker role
    inner:
      '<path d="M2 11h20"/><circle cx="7" cy="13.5" r="3.2"/><circle cx="17" cy="13.5" r="3.2"/><path d="M10.2 13a2 2 0 0 1 3.6 0"/>',
  },
  close: {
    // an X, for dismiss / remove (e.g. kicking a player from the roster)
    inner: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  },
  flag: {
    // a flag on a pole, for reporting offensive content
    inner: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  },
}

const glyph = computed<Glyph>(() => ICONS[props.name])
const dim = computed(() => (typeof props.size === 'number' ? `${props.size}` : props.size))
const innerHtml = computed(() =>
  glyph.value.fill ? `<path d="${glyph.value.inner}"/>` : glyph.value.inner,
)
</script>

<template>
  <svg
    :width="dim"
    :height="dim"
    viewBox="0 0 24 24"
    :fill="glyph.fill ? 'currentColor' : 'none'"
    :stroke="glyph.fill ? 'none' : 'currentColor'"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="dicon"
    v-html="innerHtml"
  />
</template>

<style scoped>
.dicon {
  display: inline-block;
  vertical-align: -0.18em;
  flex: none;
}
</style>
