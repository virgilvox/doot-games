<script setup lang="ts">
const route = useRoute()
const pluginId = computed(() => String(route.params.plugin))
</script>

<template>
  <!-- HostRoom is client-only: it opens the relay connection in the browser. -->
  <ClientOnly>
    <HostRoom :plugin-id="pluginId" />
    <template #fallback>
      <div class="boot">Setting up the room…</div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.boot {
  display: grid;
  place-items: center;
  min-height: 100vh;
  color: var(--ink-soft);
}
</style>
