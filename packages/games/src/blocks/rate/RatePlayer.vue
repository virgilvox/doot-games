<script setup lang="ts">
import { RatingStrip } from '@doot-games/ui'
import { computed } from 'vue'
import { type RateContent, type RateInput, stepsForScale } from './block'

const props = defineProps<{ content: RateContent; modelValue: RateInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: RateInput] }>()

const steps = computed(() => stepsForScale(props.content.scale))
</script>

<template>
  <RatingStrip
    :categories="content.categories"
    :steps="steps"
    :model-value="modelValue.ratings"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', { ratings: $event })"
  />
</template>
