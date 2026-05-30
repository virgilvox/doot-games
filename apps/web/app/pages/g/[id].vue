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
  ownerId: string | null
  visibility: 'private' | 'unlisted' | 'public'
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

// Owner-only management: change visibility, delete.
const session = authClient.useSession()
const isOwner = computed(() => !!game.value?.ownerId && session.value?.data?.user?.id === game.value.ownerId)
const visibility = ref(game.value?.visibility ?? 'private')
const saving = ref(false)
const manageError = ref('')
async function changeVisibility() {
  if (!game.value) return
  saving.value = true
  manageError.value = ''
  try {
    await $fetch(`/api/games/${game.value.id}`, { method: 'PATCH', body: { visibility: visibility.value } })
  } catch (e) {
    manageError.value = (e as { statusMessage?: string })?.statusMessage ?? 'Could not update.'
  } finally {
    saving.value = false
  }
}
async function remove() {
  if (!game.value || !confirm('Delete this game? This cannot be undone.')) return
  try {
    await $fetch(`/api/games/${game.value.id}`, { method: 'DELETE' })
    await navigateTo('/explore')
  } catch (e) {
    manageError.value = (e as { statusMessage?: string })?.statusMessage ?? 'Could not delete.'
  }
}
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
          <span v-if="game.visibility !== 'public'" class="badge">{{ game.visibility }}</span>
        </div>
        <p class="detail-note">
          Host this on a big screen, players join from their phones with the room code that appears.
        </p>
        <div class="detail-actions">
          <NuxtLink :to="`/host/g/${game.id}`" class="btn btn-primary btn-lg">Host this game</NuxtLink>
          <NuxtLink :to="`/editor/${game.pluginId}`" class="btn btn-ghost btn-lg">Build your own</NuxtLink>
        </div>

        <div v-if="isOwner" class="manage">
          <span class="manage-label">Manage your game</span>
          <div class="manage-row">
            <select v-model="visibility" class="sf-select" aria-label="Visibility" :disabled="saving" @change="changeVisibility">
              <option value="private">Private</option>
              <option value="unlisted">Unlisted (link only)</option>
              <option value="public">Public (listed)</option>
            </select>
            <button class="btn btn-ghost btn-sm" @click="remove">Delete</button>
          </div>
          <p v-if="manageError" class="sf-error">{{ manageError }}</p>
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
.manage {
  margin-top: 36px;
  padding-top: 24px;
  border-top: var(--bd) solid var(--line-soft);
}
.manage-label {
  display: block;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  font-weight: 700;
  margin-bottom: 12px;
}
.manage-row {
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}
.manage-row .sf-select {
  width: auto;
  min-width: 180px;
}
</style>
