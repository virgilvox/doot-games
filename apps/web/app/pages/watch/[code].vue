<script setup lang="ts">
/** Spectate a room by code (Retro Arcade broadcast). The viewer is client-only. */
const route = useRoute()
const code = computed(() => String(route.params.code).toUpperCase())
useHead({ title: `Watch ${code.value} on Doot` })
</script>

<template>
  <ClientOnly>
    <WatchRoom :room="code" />
  </ClientOnly>
</template>
