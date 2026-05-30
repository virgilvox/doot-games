<script setup lang="ts">
/** Shareable detail page for a saved game: what it is, who can do what with it. */
import { gameCatalog } from '@doot-games/games/catalog'
import { themeList } from '@doot-games/themes'
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
  description: string | null
  tags: string[]
  coverImage: string | null
  forkable: boolean
  isOwner: boolean
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
const themeName = computed(
  () => themeList.find((t) => t.id === game.value?.themeId)?.name ?? game.value?.themeId ?? '',
)
const roundCount = computed(() => game.value?.config.rounds.length ?? 0)

const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)
const isOwner = computed(() => !!game.value?.isOwner)
const canFork = computed(() => !isOwner.value && !!game.value?.forkable)

// Owner management: visibility, forking, delete.
const visibility = ref(game.value?.visibility ?? 'private')
const forkable = ref(!!game.value?.forkable)
const saving = ref(false)
const manageError = ref('')
async function patch(body: Record<string, unknown>) {
  if (!game.value) return
  saving.value = true
  manageError.value = ''
  try {
    await $fetch(`/api/games/${game.value.id}`, { method: 'PATCH', body })
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
        <img v-if="game.coverImage" :src="game.coverImage" alt="" class="detail-cover" />
        <span class="kicker">Saved game</span>
        <h1 class="detail-title">{{ game.title }}</h1>
        <div class="detail-meta">
          <span class="badge type">{{ typeName }}</span>
          <span class="badge">{{ roundCount }} {{ roundCount === 1 ? 'round' : 'rounds' }}</span>
          <span class="badge">{{ themeName }} theme</span>
          <span v-if="game.visibility !== 'public'" class="badge">{{ game.visibility }}</span>
          <span v-for="t in game.tags" :key="t" class="badge">{{ t }}</span>
        </div>
        <p v-if="game.description" class="detail-desc">{{ game.description }}</p>
        <p class="detail-note">
          Host this on a big screen, players join from their phones with the room code that appears.
        </p>
        <div class="detail-actions">
          <NuxtLink :to="`/host/g/${game.id}`" class="btn btn-primary btn-lg">Host this game</NuxtLink>
          <NuxtLink v-if="isOwner" :to="`/editor/g/${game.id}`" class="btn btn-ghost btn-lg">Edit this game</NuxtLink>
          <NuxtLink v-else-if="canFork && loggedIn" :to="`/editor/g/${game.id}`" class="btn btn-ghost btn-lg">Fork this game</NuxtLink>
          <NuxtLink v-else-if="canFork" :to="`/login?redirect=/editor/g/${game.id}`" class="btn btn-ghost btn-lg">Log in to fork</NuxtLink>
          <NuxtLink v-else :to="`/editor/${game.pluginId}`" class="btn btn-ghost btn-lg">Build your own</NuxtLink>
        </div>

        <div v-if="isOwner" class="manage">
          <span class="manage-label">Manage your game</span>
          <div class="manage-row">
            <select v-model="visibility" class="sf-select" aria-label="Visibility" :disabled="saving" @change="patch({ visibility })">
              <option value="private">Private</option>
              <option value="unlisted">Unlisted (link only)</option>
              <option value="public">Public (listed)</option>
            </select>
            <NuxtLink :to="`/editor/g/${game.id}`" class="btn btn-ghost btn-sm">Edit</NuxtLink>
            <button class="btn btn-ghost btn-sm" @click="remove">Delete</button>
          </div>
          <label class="sf-toggle manage-fork">
            <input type="checkbox" v-model="forkable" :disabled="saving" @change="patch({ forkable })" />
            <span>Let others fork (copy) this game</span>
          </label>
          <p v-if="manageError" class="sf-error">{{ manageError }}</p>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.detail {
  padding: 40px 0;
  text-align: center;
}
.detail-cover {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  border-radius: 16px;
  border: var(--bd) solid var(--line-soft);
  margin-bottom: 22px;
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
.detail-desc {
  font-size: 17px;
  line-height: 1.5;
  max-width: 50ch;
  margin: 18px auto 0;
}
.detail-note {
  color: var(--ink-soft);
  font-size: 15px;
  line-height: 1.5;
  max-width: 46ch;
  margin: 16px auto 0;
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
.manage-fork {
  justify-content: center;
  margin-top: 14px;
}
</style>
