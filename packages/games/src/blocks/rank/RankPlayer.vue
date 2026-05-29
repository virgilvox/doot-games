<script setup lang="ts">
import { RankList } from '@doot-games/ui'
import type { RankContent, RankInput } from './block'

defineProps<{ content: RankContent; modelValue: RankInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: RankInput] }>()
</script>

<template>
  <RankList
    :items="content.items"
    :model-value="modelValue.order"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', { order: $event })"
  />
</template>
