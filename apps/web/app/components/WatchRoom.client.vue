<script setup lang="ts">
/**
 * Watch a Retro Arcade game by room code, no controller. Client-only: it joins
 * the room as audience (so it takes no controller slot), connects to the host's
 * WebRTC broadcast, and shows the live screen with a fullscreen toggle and a
 * responsive fit. This is the popout target and the standalone spectator page.
 */
import { createClaspRelay } from '@doot-games/engine'
import { provideDootRoom, useDootRoom } from '@doot-games/engine/vue'
import { type ViewerState, createViewer, webrtcSupported } from '@doot-games/games'
import { onScopeDispose, ref, watch } from 'vue'

const props = defineProps<{ room: string }>()
const code = props.room
const runtime = useRuntimeConfig()

const supported = webrtcSupported()
const relay = createClaspRelay(runtime.public.relayUrl as string, { name: `doot-watch:${props.room}` })
const room = useDootRoom({ relay, room: props.room, role: 'audience', name: 'spectator' })
provideDootRoom(room)

// Adopt the host's theme once meta arrives.
const activeTheme = useState<string>('doot-theme', () => 'doot')
watch(
  () => room.theme.value,
  (t) => {
    if (t) activeTheme.value = t
  },
)
const gameName = ref('')
room.onExtra('meta', (v) => {
  const mm = v as { game?: string } | null
  if (mm?.game) gameName.value = mm.game
})

const video = ref<HTMLVideoElement | null>(null)
const state = ref<ViewerState>('connecting')
const soundOn = ref(false)
let viewer: ReturnType<typeof createViewer> | null = null

function start() {
  if (!supported || !video.value) return
  viewer = createViewer(room, video.value, (s) => (state.value = s))
}
function toggleSound() {
  soundOn.value = !soundOn.value
  viewer?.setMuted(!soundOn.value)
}
function fullscreen() {
  const el = video.value
  if (!el) return
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  else el.requestFullscreen?.().catch(() => {})
}

onMounted(() => {
  // Wait a frame so the <video> is in the DOM, then connect.
  requestAnimationFrame(start)
})
onScopeDispose(() => viewer?.close())

const label = () => {
  if (!supported) return 'This browser has no WebRTC support.'
  if (state.value === 'connected') return gameName.value || 'Live'
  if (state.value === 'failed') return 'Could not connect. The host may not be broadcasting, or this network needs a TURN server.'
  return 'Connecting to the stream'
}
</script>

<template>
  <main class="watch">
    <div class="frame">
      <video ref="video" class="vid" playsinline autoplay muted />
      <div v-if="state !== 'connected'" class="overlay">{{ label() }}</div>
    </div>
    <div class="bar">
      <span class="code mono">Room {{ code }}</span>
      <span class="state mono" :class="{ live: state === 'connected' }">{{ state === 'connected' ? 'live' : state }}</span>
      <button class="snd" :class="{ on: soundOn }" :aria-pressed="soundOn" @click="toggleSound">{{ soundOn ? 'Sound on' : 'Sound off' }}</button>
      <button class="fs" @click="fullscreen">Fullscreen</button>
    </div>
  </main>
</template>

<style scoped>
.watch {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.frame {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
.vid {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: #000;
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.overlay {
  position: absolute;
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
  text-align: center;
  max-width: 40ch;
  padding: 0 16px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-top: var(--bd) solid var(--line);
  background: var(--surface);
}
.code {
  font-weight: 700;
  color: var(--ink);
}
.state {
  color: var(--mute);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.08em;
}
.state.live {
  color: var(--c5);
}
.snd {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  padding: 8px 14px;
  border-radius: 999px;
  border: var(--bd) solid var(--line);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.snd.on {
  background: var(--c5);
  color: var(--ink);
  border-color: var(--c5);
}
.fs {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 999px;
  border: var(--bd) solid var(--line);
  background: var(--primary);
  color: var(--primary-ink);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
</style>
