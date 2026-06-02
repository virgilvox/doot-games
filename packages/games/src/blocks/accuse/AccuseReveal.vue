<script setup lang="ts">
/**
 * Phone reveal for the Accuse round: who the faker was, the word, and how you did.
 * If you were the faker it tells you whether you escaped; otherwise whether your
 * accusation landed.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import type { AccuseInput, AccuseRevealSummary } from './block'

const props = defineProps<{
  content: unknown
  myInput?: AccuseInput | null
  reveal?: AccuseRevealSummary | null
}>()

const room = injectDootRoom()
const myId = computed(() => room.me.value.id)
const fakerPid = computed(() => props.reveal?.fakerPid ?? '')
const wasFaker = computed(() => !!fakerPid.value && fakerPid.value === myId.value)
const caught = computed(() => props.reveal?.caught === true)
const myChoice = computed(() => props.myInput?.choice ?? '')
const gotIt = computed(() => !!myChoice.value && myChoice.value === fakerPid.value)
</script>

<template>
  <div class="accuse-reveal" aria-live="polite">
    <div class="badge" :class="{ win: wasFaker ? !caught : gotIt }">
      <Icon :name="wasFaker ? 'mask' : 'eye'" :size="34" />
    </div>
    <h2>The faker was {{ reveal?.fakerName || '...' }}</h2>
    <p class="word">The word was <b>{{ reveal?.word || '...' }}</b></p>

    <p v-if="wasFaker" class="verdict">
      <template v-if="caught">You got caught. Better luck blending in next time.</template>
      <template v-else>You slipped right past them. Faker escapes.</template>
    </p>
    <p v-else-if="gotIt" class="verdict">You called it. Nice read.</p>
    <p v-else-if="myChoice" class="verdict">You pointed the wrong way this time.</p>
    <p v-else class="verdict">You sat this vote out.</p>
  </div>
</template>

<style scoped>
.accuse-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
}
.badge {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--ink-soft);
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
}
.badge.win {
  color: var(--primary-ink);
  background: var(--primary);
  border-color: var(--line);
}
.accuse-reveal h2 {
  font-size: clamp(24px, 7vw, 36px);
  font-weight: 800;
}
.word {
  color: var(--ink-soft);
}
.word b {
  color: var(--ink);
}
.verdict {
  color: var(--ink-soft);
  max-width: 30ch;
  line-height: 1.45;
  font-weight: 600;
}
</style>
