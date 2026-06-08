<script setup lang="ts">
/**
 * A themed audio-clip player for trivia prompts ("Name That Tune"). It wraps a
 * native <audio> element with a play/pause button + a seek bar, so it is:
 * - SSR-safe: the element renders inert on the server; playback only ever starts
 *   from a tap (which also satisfies the browser autoplay policy), so there is no
 *   autoplay and `prefers-reduced-motion` needs nothing special.
 * - Accessible: the toggle is a real button with an aria-label/pressed state; the
 *   seek bar is a labelled range input.
 * - A clean no-op: if the clip 404s or the codec is unsupported it shows a quiet
 *   "couldn't load" note instead of breaking the round.
 * The user controls volume/mute via their device; clips are user-provided URLs.
 */
import { computed, ref } from 'vue'

withDefaults(defineProps<{ src: string; label?: string }>(), { label: 'Audio clip' })
const el = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const cur = ref(0)
const dur = ref(0)
const failed = ref(false)

function toggle() {
  const a = el.value
  if (!a || failed.value) return
  if (a.paused) {
    a.play()
      .then(() => {
        playing.value = true
      })
      .catch(() => {
        /* a blocked/failed play is a no-op, not a crash */
      })
  } else {
    a.pause()
    playing.value = false
  }
}
function onTime() {
  cur.value = el.value?.currentTime ?? 0
}
function onMeta() {
  const d = el.value?.duration ?? 0
  dur.value = Number.isFinite(d) ? d : 0
}
function onEnded() {
  playing.value = false
}
function onSeek(e: Event) {
  const a = el.value
  if (!a || !dur.value) return
  a.currentTime = (Number((e.target as HTMLInputElement).value) / 100) * dur.value
}
const pct = computed(() => (dur.value ? Math.min(100, (cur.value / dur.value) * 100) : 0))
function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="clip" :class="{ dead: failed }">
    <audio
      ref="el"
      :src="src"
      preload="metadata"
      @timeupdate="onTime"
      @loadedmetadata="onMeta"
      @ended="onEnded"
      @error="failed = true"
    />
    <template v-if="!failed">
      <button
        type="button"
        class="clip-btn"
        :aria-label="playing ? 'Pause' : 'Play'"
        :aria-pressed="playing"
        @click="toggle"
      >
        <span v-if="playing" class="ico-pause" aria-hidden="true"><i /><i /></span>
        <span v-else class="ico-play" aria-hidden="true" />
      </button>
      <div class="clip-body">
        <span class="clip-label">{{ label }}</span>
        <input
          class="clip-seek"
          type="range"
          min="0"
          max="100"
          step="0.5"
          :value="pct"
          :aria-label="`Seek ${label}`"
          @input="onSeek"
        />
        <span class="clip-time mono">{{ fmt(cur) }} / {{ fmt(dur) }}</span>
      </div>
    </template>
    <p v-else class="clip-dead">Couldn't load the audio clip.</p>
  </div>
</template>

<style scoped>
.clip {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 12px 16px;
  box-shadow: var(--shadow-sm);
}
.clip-btn {
  flex: none;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: var(--bd) solid var(--primary);
  background: color-mix(in srgb, var(--primary) 14%, var(--surface));
  color: var(--primary);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform 0.1s;
}
.clip-btn:hover {
  transform: translateY(-1px);
}
.clip-btn:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
/* CSS-shape play/pause glyphs (no emoji, no icon font dependency). */
.ico-play {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 9px 0 9px 15px;
  border-color: transparent transparent transparent currentColor;
  margin-left: 3px;
}
.ico-pause {
  display: inline-flex;
  gap: 4px;
}
.ico-pause i {
  width: 5px;
  height: 18px;
  background: currentColor;
  border-radius: 1px;
}
.clip-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
}
.clip-label {
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
}
.clip-seek {
  width: 100%;
  accent-color: var(--primary);
}
.clip-time {
  font-size: 12px;
  color: var(--mute);
  font-weight: 700;
}
.clip-dead {
  color: var(--mute);
  font-weight: 600;
  font-size: 14px;
}
</style>
