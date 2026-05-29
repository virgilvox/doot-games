<script setup lang="ts">
import { OptionGrid } from '@doot-games/ui'
import type { PollContent, PollInput } from './block'

defineProps<{ content: PollContent; modelValue: PollInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: PollInput] }>()
</script>

<template>
  <OptionGrid
    :options="content.options"
    :selected="modelValue.choice"
    :disabled="disabled"
    @select="emit('update:modelValue', { choice: $event })"
  />
</template>
