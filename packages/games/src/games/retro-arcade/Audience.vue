<script setup lang="ts">
/**
 * Retro Arcade spectator view: someone opened the room to watch (not play), so we
 * show the live emulator stream instead of the generic audience board. Connects as
 * a WebRTC viewer over the room's CLASP signaling channels and fills the screen
 * with the host's canvas. The host's stream server arms itself on the first viewer
 * hello, so simply being here turns the broadcast on.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { type ViewerState, createViewer, webrtcSupported } from './stream'

defineProps<{ plugin: GamePlugin; code?: string }>()
const room = injectDootRoom()
const supported = webrtcSupported()

const video = ref<HTMLVideoElement | null>(null)
const state = ref<ViewerState>('connecting')
let viewer: ReturnType<typeof createViewer> | null = null

const status = computed(() => {
  if (!supported) return 'This browser cannot play the live stream.'
  if (state.value === 'connected') return 'live'
  if (state.value === 'failed') return 'No signal. The host may not be playing yet.'
  return 'Connecting to the screen...'
})

function fullscreen() {
  const el = video.value?.parentElement ?? video.value
  el?.requestFullscreen?.().catch(() => {})
}

onMounted(() => {
  if (!supported || !video.value) return
  viewer = createViewer(room, video.value, (s) => (state.value = s))
})
onUnmounted(() => viewer?.close())
</script>

<template>
  <div class="watch">
    <header class="bar">
      <span class="brand">Retro Arcade</span>
      <span class="mid mono">Room {{ code ?? room.runtime.room }}</span>
      <span class="right">
        <span class="state mono" :class="{ on: state === 'connected' }">{{ state === 'connected' ? 'live' : '...' }}</span>
        <button class="fs" aria-label="Fullscreen" @click="fullscreen">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </span>
    </header>

    <div class="stage">
      <video ref="video" class="vid" playsinline autoplay muted />
      <div v-if="state !== 'connected'" class="overlay">
        <div class="spinner" :class="{ stop: state === 'failed' || !supported }" />
        <p>{{ status }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.watch {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.bar {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 8px max(12px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--line-soft);
}
.brand {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 14px;
}
.mid {
  font-size: 12px;
  color: var(--mute);
  text-align: center;
}
.right {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.state {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--mute);
}
.state.on {
  color: var(--c5);
}
.fs {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: var(--bd) solid var(--line);
  background: var(--surface);
  color: var(--ink);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}
.vid {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #fff;
  text-align: center;
  padding: 24px;
}
.overlay p {
  max-width: 30ch;
  line-height: 1.45;
  opacity: 0.85;
}
.spinner {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: var(--primary);
  animation: spin 0.9s linear infinite;
}
.spinner.stop {
  animation: none;
  border-top-color: rgba(255, 255, 255, 0.25);
  opacity: 0.4;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
