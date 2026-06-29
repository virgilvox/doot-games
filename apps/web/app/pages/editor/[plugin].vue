<script setup lang="ts">
const route = useRoute()
const pluginId = computed(() => String(route.params.plugin))
// Optional quick-start seed (/editor/custom?seed=guess): opens the builder with one
// round of that kind instead of the default sample rounds. Ignored if not applicable.
const seed = computed(() => {
  const s = route.query.seed
  return typeof s === 'string' && s ? s : undefined
})
</script>

<template>
  <!-- The editor is client-only: it mounts block player views for live preview
       and hands the authored composition to the host via the in-memory draft. -->
  <ClientOnly>
    <!-- Key by plugin + seed so opening a different type/seed mounts a fresh editor
         (the seed is applied once at setup; without this a query-only change reuses
         the instance and the new seed would not take). -->
    <GameEditor :key="`${pluginId}:${seed ?? ''}`" :plugin-id="pluginId" :seed="seed" />
    <template #fallback>
      <div class="boot">Opening the editor…</div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.boot {
  display: grid;
  place-items: center;
  min-height: 60vh;
  color: var(--ink-soft);
}
</style>
