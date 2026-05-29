<script setup lang="ts">
import { OptionGrid } from '@doot-games/ui'
import type { GuessContent, GuessInput } from './block'

defineProps<{ content: GuessContent; modelValue: GuessInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: GuessInput] }>()
</script>

<template>
  <div class="guess-player">
    <OptionGrid
      :options="content.options"
      :selected="modelValue.choice"
      :disabled="disabled"
      @select="emit('update:modelValue', { choice: $event })"
    />
  </div>
</template>
