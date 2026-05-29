<script setup lang="ts">
const route = useRoute()
const pluginId = computed(() => String(route.params.plugin))
</script>

<template>
  <!-- The editor is client-only: it mounts block player views for live preview
       and hands the authored composition to the host via the in-memory draft. -->
  <ClientOnly>
    <GameEditor :plugin-id="pluginId" />
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
