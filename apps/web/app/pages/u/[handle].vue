<script setup lang="ts">
/**
 * Public profile at /u/@handle: a creator's display name, handle, avatar, bio,
 * and the games they have published publicly. Read-only and email-free. An
 * unknown/unclaimed handle renders the 404 page.
 */
import { gameCatalog } from '@doot-games/games/catalog'
import { GameCover } from '@doot-games/ui'
import { computed, ref } from 'vue'

interface PublicProfile {
  name: string | null
  handle: string
  image: string | null
  bio: string | null
}
interface GameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  authorName: string | null
  coverImage: string | null
}

const route = useRoute()
// The route param is the @handle; the API strips a leading "@" itself.
const handleParam = computed(() => String(route.params.handle))

const { data, error } = await useFetch<{ profile: PublicProfile; games: GameSummary[] }>(
  () => `/api/users/${encodeURIComponent(handleParam.value)}`,
)
if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
}

const profile = computed(() => data.value!.profile)
const games = computed(() => data.value!.games ?? [])
const displayName = computed(() => profile.value.name || `@${profile.value.handle}`)
const monogram = computed(() => (displayName.value || '?').charAt(0).toUpperCase())
const avatarBroken = ref(false)
const typeName = (id: string) => gameCatalog.find((c) => c.id === id)?.name ?? id

useDootSeo({
  title: `${displayName.value} on Doot`,
  shareTitle: displayName.value,
  description: profile.value.bio || `${displayName.value}'s party games on Doot.`,
  image: profile.value.image || undefined,
  type: 'profile',
})
</script>

<template>
  <main>
    <div class="wrap profile-wrap">
      <header class="profile-head">
        <span class="avatar" aria-hidden="true">
          <img v-if="profile.image && !avatarBroken" :src="profile.image" :alt="displayName" @error="avatarBroken = true" />
          <span v-else class="avatar-mono">{{ monogram }}</span>
        </span>
        <div class="profile-id">
          <h1 class="profile-name">{{ displayName }}</h1>
          <p class="profile-handle">@{{ profile.handle }}</p>
        </div>
        <p v-if="profile.bio" class="profile-bio">{{ profile.bio }}</p>
      </header>

      <section class="section">
        <div class="section-head">
          <div><span class="kicker">Public games</span><h2>{{ games.length }} {{ games.length === 1 ? 'game' : 'games' }}</h2></div>
        </div>
        <div v-if="games.length" class="grid">
          <NuxtLink v-for="g in games" :key="g.id" :to="`/g/${g.id}`" class="card">
            <GameCover :title="g.title" :type="g.pluginId" :image="g.coverImage" />
            <div class="card-body">
              <div class="card-title">{{ g.title }}</div>
              <div class="card-meta">
                <span class="badge type">{{ typeName(g.pluginId) }}</span>
                <span class="badge">{{ g.themeId }}</span>
              </div>
              <span class="card-cta">View &amp; host &rarr;</span>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="empty">No public games yet.</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.profile-wrap {
  max-width: 960px;
  padding: 44px 0 8px;
}
.profile-head {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 20px;
  align-items: center;
  padding-bottom: 28px;
  border-bottom: var(--bd) solid var(--line-soft);
  margin-bottom: 8px;
}
.avatar {
  grid-row: span 2;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  overflow: hidden;
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  display: grid;
  place-items: center;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-mono {
  font-size: 38px;
  font-weight: 800;
  color: var(--ink-soft);
}
/* The text column must be allowed to shrink below its content width, else a long
   unbroken display name or handle forces horizontal overflow on a phone. */
.profile-id {
  min-width: 0;
}
.profile-name {
  font-size: clamp(26px, 5vw, 36px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  overflow-wrap: anywhere;
}
.profile-handle {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  color: var(--primary);
  font-weight: 600;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.profile-bio {
  grid-column: 2;
  min-width: 0;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 16px;
  line-height: 1.5;
  max-width: 60ch;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.card-cta {
  display: inline-block;
  margin-top: 8px;
  color: var(--primary);
  font-weight: 800;
  font-size: 14px;
}
.empty {
  color: var(--ink-soft);
  padding: 8px 0 28px;
}
@media (max-width: 560px) {
  .profile-head {
    grid-template-columns: auto 1fr;
  }
  .profile-bio {
    grid-column: 1 / -1;
  }
}
</style>
