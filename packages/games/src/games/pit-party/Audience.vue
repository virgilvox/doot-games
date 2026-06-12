<script setup lang="ts">
/**
 * Spectator view for `/watch/<code>`: a full-screen WebRTC viewer of the big-screen
 * race. Purely additive (PRD: second-screen, never shared-video - this is an opt-in
 * watch layer, gameplay still rides the relay). Mirrors the Retro Arcade audience.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { type ViewerState, createViewer, webrtcSupported } from './stream'

defineProps<{ code?: string }>()

const room = injectDootRoom()
const supported = webrtcSupported()
const video = ref<HTMLVideoElement | null>(null)
const state = ref<ViewerState>('connecting')
const soundOn = ref(false)
let viewer: ReturnType<typeof createViewer> | null = null

const status = computed(() => {
  if (!supported) return 'This browser cannot play the live stream.'
  if (state.value === 'connected') return 'live'
  if (state.value === 'failed') return 'No signal yet. The race may not be running.'
  return 'Connecting to the screen...'
})

function fullscreen(): void {
  const el = video.value?.parentElement ?? video.value
  el?.requestFullscreen?.().catch(() => {})
}
function toggleSound(): void {
  soundOn.value = !soundOn.value
  viewer?.setMuted(!soundOn.value)
}

onMounted(() => {
  if (!supported || !video.value) return
  viewer = createViewer(room, video.value, (s) => (state.value = s))
})
onUnmounted(() => viewer?.close())
</script>

<template>
  <div class="pit-watch">
    <header>
      <span class="brand">PIT PARTY</span>
      <span class="room mono">Room {{ code ?? room.runtime.room }}</span>
      <span class="state mono" :class="{ live: state === 'connected' }">{{ status }}</span>
      <button class="ctl" @click="toggleSound">{{ soundOn ? 'SOUND ON' : 'SOUND OFF' }}</button>
      <button class="ctl" @click="fullscreen">FULLSCREEN</button>
    </header>
    <div class="stage">
      <video ref="video" autoplay playsinline muted />
      <div v-if="state !== 'connected'" class="spin">{{ status }}</div>
    </div>
  </div>
</template>

<style scoped>
.pit-watch {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0b0a0f;
  color: #f3eee2;
  font-family: 'Chakra Petch', system-ui, sans-serif;
}
.mono {
  font-family: 'IBM Plex Mono', monospace;
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  background: #1f1c26;
  border-bottom: 3px solid #000;
}
.brand {
  font-family: 'Bungee', system-ui, sans-serif;
  color: #ffd23f;
  font-size: 15px;
}
.room {
  font-size: 11px;
  color: #9d96a8;
}
.state {
  font-size: 11px;
  color: #9d96a8;
  margin-left: auto;
}
.state.live {
  color: #5fe08a;
}
.ctl {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  background: #15131a;
  color: #f3eee2;
  border: 2px solid #2c2837;
  padding: 6px 10px;
  cursor: pointer;
}
.stage {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.spin {
  position: absolute;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: #9d96a8;
}
</style>
