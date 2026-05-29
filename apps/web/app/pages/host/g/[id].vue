<script setup lang="ts">
/** Host a saved game by id: fetch its composition, then run the host room. */
import type { GameComposition } from '@doot-games/sdk'

const route = useRoute()
const id = computed(() => String(route.params.id))

interface SavedGame {
  id: string
  pluginId: string
  title: string
  themeId: string
  config: GameComposition
}
const { data: game, error } = await useFetch<SavedGame>(() => `/api/games/${id.value}`)
if (error.value || !game.value) {
  throw createError({ statusCode: 404, statusMessage: 'Game not found' })
}
</script>

<template>
  <ClientOnly>
    <HostRoom
      v-if="game"
      :plugin-id="game.pluginId"
      :config="game.config"
      :theme-id="game.themeId"
    />
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
