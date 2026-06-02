<script setup lang="ts">
/**
 * Big-screen (host) preview of one round, for the editor. Block `HostDisplay`
 * views inject the live room (`injectDootRoom`) for reveal/answer data, so we
 * provide a READ-ONLY mock room scoped to this component: it reports the open
 * ('active') phase, no answers, no reveal, and an empty input map. That makes
 * every host view render its pre-reveal, no-answers-yet state — exactly what the
 * room sees the moment a round opens — without a relay and without leaking an
 * answer (there is none to leak). Client-only: these views aren't SSR-safe.
 */
import { type DootRoom, provideDootRoom } from '@doot-games/engine/vue'
import { type Component, computed } from 'vue'

const props = defineProps<{
  block: { HostDisplay: Component }
  content: unknown
  index: number
}>()

const emptyInputs = new Map<string, unknown>()

// A permissive, inert room: reactive reads return benign defaults; reveal/answer
// reads return undefined; actions are no-ops. Cast through `unknown` — we only
// need the subset host views touch, never the full runtime.
const mockRoom = {
  round: computed(() => ({ index: props.index, state: 'open' })),
  phase: computed(() => 'open'),
  players: computed(() => []),
  me: computed(() => ({ id: 'preview', name: 'Preview', role: 'host' })),
  config: computed(() => null),
  meta: computed(() => null),
  results: computed(() => null),
  theme: computed(() => null),
  connected: computed(() => true),
  reconnecting: computed(() => false),
  error: computed(() => null),
  ready: computed(() => true),
  isHost: computed(() => true),
  hostPresent: computed(() => true),
  joinedAtIndex: computed(() => 0),
  driverPid: computed(() => null),
  isDriver: computed(() => false),
  command: computed(() => null),
  submit: () => {},
  sendControl: () => {},
  publishExtra: () => {},
  onExtra: () => () => {},
  inputFor: () => undefined,
  inputsFor: () => emptyInputs,
  runtimeContentFor: () => undefined,
  roundRevealFor: () => undefined,
  answerKeyFor: () => undefined,
  host: {
    loadGame: () => {},
    start: () => {},
    openVoting: () => {},
    lock: () => {},
    reveal: () => {},
    next: () => {},
    finish: () => {},
    setPlayerCap: () => {},
    setDriver: () => {},
    can: () => false,
  },
  runtime: {} as never,
} as unknown as DootRoom

provideDootRoom(mockRoom)
</script>

<template>
  <component :is="props.block.HostDisplay" :content="props.content" :inputs="emptyInputs" state="open" :answer="null" />
</template>
