<script setup lang="ts">
/**
 * Live relay connection status: a pulsing dot, a text state, and an optional
 * round-trip ping. Pure reflection of state the consumer passes (no emits). The
 * state is paired with a text label, never colour alone, and announced politely.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status?: 'connected' | 'connecting' | 'disconnected'
    pingMs?: number | null
    label?: string
  }>(),
  { status: 'connecting', pingMs: null, label: '' },
)

const text = computed(() => {
  if (props.label) return props.label
  if (props.status === 'connected') return 'Connected'
  if (props.status === 'disconnected') return 'Reconnecting'
  return 'Connecting'
})
</script>

<template>
  <div class="connchip" :class="status">
    <span class="dot" aria-hidden="true" />
    <!-- Only the status text is a live region; the ping changes constantly and
         would otherwise re-announce the whole chip every tick. -->
    <span role="status" aria-live="polite">{{ text }}</span>
    <span v-if="pingMs != null" class="ping" aria-hidden="true">{{ pingMs }}ms</span>
  </div>
</template>

<style scoped>
.connchip {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 8px 14px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--mute);
}
.connected .dot {
  background: var(--c5);
  box-shadow: 0 0 8px var(--c5);
  animation: pulse 1.6s infinite;
}
.connecting .dot {
  background: var(--c1);
}
.disconnected .dot {
  background: var(--primary);
}
.ping {
  color: var(--mute);
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .connected .dot {
    animation: none;
  }
}
</style>
