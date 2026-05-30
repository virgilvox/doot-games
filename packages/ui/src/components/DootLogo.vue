<script setup lang="ts">
/** The Doot mark, two eyes and a smile, plus the wordmark. */
withDefaults(defineProps<{ size?: number; word?: boolean }>(), { size: 42, word: true })
</script>

<template>
  <span class="dlogo">
    <span class="mark" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <circle cx="8" cy="10" r="3.1" fill="#fff" />
        <circle cx="16" cy="10" r="3.1" fill="#fff" />
        <circle cx="8" cy="10" r="1.2" fill="#241910" />
        <circle cx="16" cy="10" r="1.2" fill="#241910" />
        <path d="M7 16c1.6 1.6 8.4 1.6 10 0" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </span>
    <span v-if="word" class="word">doot</span>
    <span class="sr-only">Doot</span>
  </span>
</template>

<style scoped>
.dlogo {
  display: inline-flex;
  align-items: center;
  gap: 11px;
}
.mark {
  border-radius: 13px;
  background: var(--primary);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm), var(--glow) color-mix(in srgb, var(--primary) 50%, transparent);
  display: grid;
  place-items: center;
  transform: rotate(-5deg);
}
.mark svg {
  width: 60%;
  height: 60%;
}
.word {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 30px;
  letter-spacing: -0.03em;
  color: var(--ink);
}
</style>
