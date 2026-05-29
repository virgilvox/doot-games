<script setup lang="ts">
/** Theme-aware button matching the design-system `.btn` styles. */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'default', size: 'md', block: false, disabled: false, type: 'button' },
)

const classes = computed(() => [
  'btn',
  { 'btn-primary': props.variant === 'primary', 'btn-ghost': props.variant === 'ghost' },
  { 'btn-sm': props.size === 'sm', 'btn-lg': props.size === 'lg' },
  { 'btn-block': props.block },
])
</script>

<template>
  <button :class="classes" :type="type" :disabled="disabled">
    <slot />
  </button>
</template>
