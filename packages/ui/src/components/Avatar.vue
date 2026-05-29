<script setup lang="ts">
/** A round avatar showing initials, colored deterministically from an id. */
import { avatarColor, initials } from '@doot-games/engine'
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; id?: string; size?: number }>(), {
  size: 34,
})
const color = computed(() => avatarColor(props.id ?? props.name))
const text = computed(() => initials(props.name))
</script>

<template>
  <span
    class="ava"
    :style="{
      background: color,
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.42)}px`,
    }"
    aria-hidden="true"
  >
    {{ text }}
  </span>
</template>

<style scoped>
.ava {
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-family: var(--font-display);
  font-weight: 800;
  color: #fff;
  flex: none;
  border: var(--bd) solid color-mix(in srgb, var(--line) 40%, transparent);
}
</style>
