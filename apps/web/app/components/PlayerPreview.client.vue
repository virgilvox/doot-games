<script setup lang="ts">
/**
 * Phone (player) preview of one round, for the editor. Most block `PlayerInput`
 * views are self-contained, but some inject the live room (`injectDootRoom`) to
 * read the roster, e.g. Most Likely To, whose options ARE the lobby. Rendering
 * such a view bare would throw ("No Doot room provided"), so we wrap it in a
 * READ-ONLY mock room scoped to this component, mirroring HostPreview.
 *
 * The mock reports a small sample roster so roster-driven inputs render real
 * option chips in the preview (Alex / Sam / Jordan) instead of an empty state.
 * Client-only: these views aren't SSR-safe.
 */
import { type DootRoom, provideDootRoom } from '@doot-games/engine/vue'
import { type Component, computed } from 'vue'

const props = defineProps<{
  block: { PlayerInput: Component }
  content: unknown
  modelValue: unknown
}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const samplePlayers = [
  { id: 'preview-1', name: 'Alex', joinedAtIndex: 0 },
  { id: 'preview-2', name: 'Sam', joinedAtIndex: 0 },
  { id: 'preview-3', name: 'Jordan', joinedAtIndex: 0 },
]
const emptyInputs = new Map<string, unknown>()

// A permissive, inert room: reactive reads return benign defaults; reveal/answer
// reads return undefined; actions are no-ops. Cast through `unknown` — we only
// need the subset player views touch, never the full runtime.
const mockRoom = {
  round: computed(() => ({ index: 0, state: 'open', deadline: null })),
  phase: computed(() => 'open'),
  players: computed(() => samplePlayers),
  me: computed(() => ({ id: 'preview-me', name: 'You', role: 'player' })),
  config: computed(() => null),
  meta: computed(() => null),
  results: computed(() => null),
  theme: computed(() => null),
  connected: computed(() => true),
  reconnecting: computed(() => false),
  error: computed(() => null),
  ready: computed(() => true),
  isHost: computed(() => false),
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
  <component
    :is="props.block.PlayerInput"
    :content="props.content"
    :model-value="props.modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
