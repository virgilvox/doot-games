<script setup lang="ts">
import { builtinPlugins } from '@doot-games/games'
const games = builtinPlugins.map((p) => p.manifest)
</script>

<template>
  <main>
    <div class="wrap">
      <section class="section" style="padding-top: 34px">
        <div class="section-head">
          <div><span class="kicker">Discover</span><h2>Explore games</h2></div>
        </div>
        <div class="grid">
          <NuxtLink v-for="g in games" :key="g.id" :to="`/host/${g.id}`" class="card">
            <div class="card-body">
              <div class="card-title">{{ g.name }}</div>
              <div class="card-meta">
                <span class="badge type">{{ g.id }}</span>
                <span v-for="c in g.capabilities" :key="c" class="badge">{{ c }}</span>
              </div>
              <p style="color: var(--ink-soft); font-size: 14px; line-height: 1.5">
                {{ g.description }}
              </p>
            </div>
          </NuxtLink>
        </div>
      </section>
    </div>
  </main>
</template>
