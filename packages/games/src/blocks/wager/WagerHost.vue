<script setup lang="ts">
/** Big-screen Wager view: a locked-in count while players bet, then the correct
 *  answer (and a quick tally of how the room bet) at reveal. */
import type { RoundState } from '@doot-games/engine'
import { OptionGrid } from '@doot-games/ui'
import { computed } from 'vue'
import type { WagerContent, WagerInput } from './block'

const props = defineProps<{
  content: WagerContent
  inputs: Map<string, WagerInput>
  state: RoundState
  answer?: unknown
}>()

const done = computed(() => props.state === 'reveal')
const correctIndex = computed(() => (props.answer as { correct?: number } | undefined)?.correct ?? -1)
const locked = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.choice != null) n++
  return n
})
// Per-option pick counts (only meaningful to show at reveal).
const counts = computed(() => {
  const c = props.content.options.map(() => 0)
  for (const v of props.inputs.values()) {
    if (v?.choice != null && v.choice >= 0 && v.choice < c.length) c[v.choice] = (c[v.choice] ?? 0) + 1
  }
  return c
})
</script>

<template>
  <div class="wager-host">
    <template v-if="!done">
      <!-- Only show the live count once a bet is in: a lone mono "0" renders as a
           slashed zero that reads like a crossed-out mark, not "none yet". -->
      <div v-if="locked > 0" class="big-count">
        <span class="num mono">{{ locked }}</span>
        <span class="lbl">bets placed</span>
      </div>
      <p class="hint">{{ locked > 0 ? 'Bet big on the ones you know…' : 'Waiting for the first bet…' }}</p>
    </template>
    <template v-else>
      <p class="kicker">The answer</p>
      <OptionGrid :options="content.options" :counts="counts" :correct="correctIndex" revealed />
    </template>
  </div>
</template>

<style scoped>
.wager-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 220px;
  width: min(720px, 96%);
  margin: 0 auto;
}
.big-count {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.num {
  font-size: clamp(56px, 12vw, 120px);
  font-weight: 800;
  line-height: 1;
  color: var(--primary);
}
.lbl {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: 14px;
}
.hint {
  color: var(--ink-soft);
  font-weight: 600;
}
.kicker {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 800;
  font-size: 13px;
  color: var(--ink-soft);
  align-self: center;
}
</style>
