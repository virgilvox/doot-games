<script setup lang="ts">
/** Phone input for a Wager round: pick a bet tier, then pick an answer. A correct
 *  answer adds your bet; a wrong one subtracts it. */
import { OptionGrid } from '@doot-games/ui'
import { BET_TIERS, type WagerContent, type WagerInput } from './block'

const props = defineProps<{ content: WagerContent; modelValue: WagerInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: WagerInput] }>()

function setBet(bet: number) {
  emit('update:modelValue', { ...props.modelValue, bet })
}
function setChoice(choice: number) {
  emit('update:modelValue', { ...props.modelValue, choice })
}
</script>

<template>
  <div class="wager">
    <div class="bet-row" role="group" aria-label="Your bet">
      <span class="bet-label">Bet</span>
      <button
        v-for="tier in BET_TIERS"
        :key="tier"
        type="button"
        class="bet"
        :class="{ on: modelValue.bet === tier }"
        :aria-pressed="modelValue.bet === tier"
        :disabled="disabled"
        @click="setBet(tier)"
      >
        {{ tier }}
      </button>
    </div>
    <OptionGrid :options="content.options" :selected="modelValue.choice" :disabled="disabled" @select="setChoice" />
  </div>
</template>

<style scoped>
.wager {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bet-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.bet-label {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 13px;
  color: var(--ink-soft);
}
.bet {
  font: inherit;
  font-weight: 800;
  font-size: 18px;
  color: var(--ink);
  background: var(--surface-2);
  border: 2px solid var(--line-soft);
  border-radius: 999px;
  padding: 8px 20px;
  cursor: pointer;
  min-width: 64px;
}
.bet.on {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 18%, var(--surface));
  color: var(--primary);
}
</style>
