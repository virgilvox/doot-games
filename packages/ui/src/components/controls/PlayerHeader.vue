<script setup lang="ts">
/**
 * The top-of-controller identity bar: avatar, name, a small status line, and a
 * running score. Reuses the shared Avatar for the deterministic colour. Display
 * only (no emits). Slots `#status` and `#score` override the defaults.
 */
import Avatar from '../Avatar.vue'

withDefaults(
  defineProps<{
    name: string
    id?: string
    status?: string
    score?: number | null
    scoreLabel?: string
  }>(),
  { id: '', status: '', score: null, scoreLabel: 'points' },
)
</script>

<template>
  <div class="player-hdr">
    <Avatar :name="name" :id="id || name" :size="38" />
    <div class="who">
      <div class="pname">{{ name }}</div>
      <div v-if="status || $slots.status" class="pstat">
        <slot name="status">{{ status }}</slot>
      </div>
    </div>
    <div v-if="score != null || $slots.score" class="score">
      <slot name="score">
        <b>{{ score }}</b>
        <span>{{ scoreLabel }}</span>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.player-hdr {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  width: 100%;
}
.who {
  min-width: 0;
}
.pname {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 16px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pstat {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mute);
}
.score {
  margin-left: auto;
  text-align: right;
  line-height: 1.1;
}
.score b {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 24px;
  color: var(--primary);
}
.score span {
  display: block;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute);
}
</style>
