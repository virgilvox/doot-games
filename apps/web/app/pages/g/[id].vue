<script setup lang="ts">
/** Shareable detail page for a saved game: what it is, and a button to host it. */
import { gameCatalog } from '@doot-games/games/catalog'
import type { GameComposition } from '@doot-games/sdk'

const route = useRoute()
const id = computed(() => String(route.params.id))

interface SavedGame {
  id: string
  pluginId: string
  title: string
  themeId: string
  config: GameComposition
  createdAt: number
}
const { data: game, error } = await useFetch<SavedGame>(() => `/api/games/${id.value}`)
if (error.value || !game.value) {
  throw createError({ statusCode: 404, statusMessage: 'Game not found' })
}

const typeName = computed(
  () => gameCatalog.find((c) => c.id === game.value?.pluginId)?.name ?? game.value?.pluginId ?? '',
)
const roundCount = computed(() => game.value?.config.rounds.length ?? 0)
</script>

<template>
  <main>
    <div class="wrap" style="max-width: 720px">
      <div v-if="game" class="detail">
        <span class="kicker">Saved game</span>
        <h1 class="detail-title">{{ game.title }}</h1>
        <div class="detail-meta">
          <span class="badge type">{{ typeName }}</span>
          <span class="badge">{{ roundCount }} {{ roundCount === 1 ? 'round' : 'rounds' }}</span>
          <span class="badge">{{ game.themeId }} theme</span>
        </div>
        <p class="detail-note">
          Host this on a big screen — players join from their phones with the room code that appears.
        </p>
        <div class="detail-actions">
          <NuxtLink :to="`/host/g/${game.id}`" class="btn btn-primary btn-lg">Host this game</NuxtLink>
          <NuxtLink :to="`/editor/${game.pluginId}`" class="btn btn-ghost btn-lg">Build your own</NuxtLink>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.detail {
  padding: 48px 0;
  text-align: center;
}
.detail-title {
  font-size: clamp(32px, 6vw, 48px);
  font-weight: 800;
  margin-top: 8px;
}
.detail-meta {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 16px;
}
.detail-note {
  color: var(--ink-soft);
  font-size: 16px;
  line-height: 1.5;
  max-width: 46ch;
  margin: 20px auto 0;
}
.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 28px;
}
</style>
