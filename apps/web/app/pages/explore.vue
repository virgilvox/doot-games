<script setup lang="ts">
import { gameCatalog } from '@doot-games/games/catalog'

interface SavedGameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  createdAt: number
}
const { data } = await useFetch<{ games: SavedGameSummary[] }>('/api/games')
const saved = computed(() => data.value?.games ?? [])
const typeName = (id: string) => gameCatalog.find((c) => c.id === id)?.name ?? id
</script>

<template>
  <main>
    <div class="wrap">
      <section v-if="saved.length" class="section" style="padding-top: 34px">
        <div class="section-head">
          <div><span class="kicker">Discover</span><h2>Saved games</h2></div>
        </div>
        <div class="grid">
          <NuxtLink v-for="g in saved" :key="g.id" :to="`/g/${g.id}`" class="card">
            <div class="card-body">
              <div class="card-title">{{ g.title }}</div>
              <div class="card-meta">
                <span class="badge type">{{ typeName(g.pluginId) }}</span>
                <span class="badge">{{ g.themeId }}</span>
              </div>
              <span class="btn btn-primary btn-sm">View &amp; host</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="section" :style="saved.length ? '' : 'padding-top: 34px'">
        <div class="section-head">
          <div>
            <span class="kicker">Build</span>
            <h2>{{ saved.length ? 'Start a new game' : 'No saved games yet — start one' }}</h2>
          </div>
        </div>
        <div class="grid">
          <NuxtLink v-for="c in gameCatalog" :key="c.id" :to="`/editor/${c.id}`" class="card">
            <div class="card-body">
              <div class="card-title">{{ c.name }}</div>
              <p style="color: var(--ink-soft); font-size: 14px; line-height: 1.5; min-height: 44px">
                {{ c.description }}
              </p>
              <span class="btn btn-ghost btn-sm">Open editor</span>
            </div>
          </NuxtLink>
        </div>
      </section>
    </div>
  </main>
</template>
