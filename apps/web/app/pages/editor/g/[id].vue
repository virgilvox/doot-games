<script setup lang="ts">
/** Open a saved game in the editor: edit in place (owner) or fork it (others,
 *  when the owner allowed forking). */
import type { GameComposition } from '@doot-games/sdk'

const route = useRoute()
const id = computed(() => String(route.params.id))

interface SavedGame {
  id: string
  pluginId: string
  themeId: string
  visibility: 'private' | 'unlisted' | 'public'
  description: string | null
  tags: string[]
  coverImage: string | null
  forkable: boolean
  config: GameComposition
  isOwner: boolean
}
const { data: game, error } = await useFetch<SavedGame>(() => `/api/games/${id.value}`)
if (error.value || !game.value) {
  throw createError({ statusCode: 404, statusMessage: 'Game not found' })
}
// Non-owners can only open the editor to fork, and only if forking is allowed.
if (!game.value.isOwner && !game.value.forkable) {
  await navigateTo(`/g/${id.value}`)
}
</script>

<template>
  <ClientOnly>
    <GameEditor v-if="game" :initial-game="game" :can-edit="game.isOwner" />
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
