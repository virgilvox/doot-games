<script setup lang="ts">
/** A row of headline stat cards. Reads the SDK's StatItem shape. */
interface Stat {
  label: string
  value: string | number
}
defineProps<{ stats: Stat[] }>()
</script>

<template>
  <div class="statrow">
    <div v-for="(s, i) in stats" :key="i" class="stat panel">
      <div class="sv">{{ s.value }}</div>
      <div class="sl">{{ s.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.statrow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}
.stat {
  padding: 16px;
  text-align: center;
}
.sv {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 34px;
  color: var(--c1);
}
.sl {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute);
  margin-top: 2px;
}
</style>
