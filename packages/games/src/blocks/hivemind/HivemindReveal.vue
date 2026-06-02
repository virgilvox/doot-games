<script setup lang="ts">
/**
 * Phone reveal for a Hivemind round: tells the player on THEIR screen how well
 * they read the room, instead of only pointing at the big screen.
 */
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import { type HivemindContent, type HivemindInput, type HivemindRevealSummary, normalizeAnswer } from './block'

const props = defineProps<{
  content: HivemindContent
  myInput?: HivemindInput | null
  reveal?: HivemindRevealSummary | null
}>()

const answered = computed(() => !!props.myInput?.text?.trim())
// My cluster size is keyed by pid on the host, but the phone doesn't know its own
// pid here; fall back to matching my normalized answer against the published
// clusters (same normalization the host used).
const myKey = computed(() => normalizeAnswer(props.myInput?.text ?? ''))
const myCluster = computed(() => {
  if (!answered.value || !props.reveal) return 0
  const hit = props.reveal.clusters.find((c) => normalizeAnswer(c.label) === myKey.value)
  return hit?.count ?? 1
})
const matchedOthers = computed(() => Math.max(0, myCluster.value - 1))
const top = computed(() => props.reveal?.topLabel ?? '')
const withHive = computed(() => answered.value && normalizeAnswer(top.value) === myKey.value)
</script>

<template>
  <div class="hive-reveal big" aria-live="polite">
    <template v-if="!answered">
      <div class="badge no" aria-hidden="true">&#8211;</div>
      <h2>No answer</h2>
      <p>The hive said <b>{{ top }}</b>.</p>
    </template>
    <template v-else-if="matchedOthers > 0">
      <div class="badge ok" aria-hidden="true">&#10003;</div>
      <h2>{{ matchedOthers }} matched you</h2>
      <p v-if="withHive">You <b>are</b> the hive mind.</p>
      <p v-else>The hive said <b>{{ top }}</b>.</p>
    </template>
    <template v-else>
      <div class="badge no" aria-hidden="true"><Icon name="cpu" :size="32" /></div>
      <h2>Lone wolf</h2>
      <p>Nobody else said that. The hive said <b>{{ top }}</b>.</p>
    </template>
  </div>
</template>

<style scoped>
.hive-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
}
.badge {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 38px;
  font-weight: 800;
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
}
.badge.ok { background: color-mix(in srgb, var(--c5) 22%, var(--surface)); color: var(--c5); }
.badge.no { background: var(--surface-2); color: var(--ink-soft); }
.hive-reveal h2 { font-size: clamp(28px, 8vw, 40px); font-weight: 800; }
.hive-reveal p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
.hive-reveal b { color: var(--ink); }
</style>
