<script setup lang="ts">
import { builtinPlugins } from '@doot-games/games'
const types = builtinPlugins.map((p) => p.manifest)
</script>

<template>
  <main>
    <div class="wrap">
      <div style="text-align: center; padding: 40px 0 8px">
        <span class="kicker">Build something</span>
        <h1 style="font-size: clamp(32px, 6vw, 46px); font-weight: 800; margin-top: 8px">
          Start a new game
        </h1>
        <p style="font-size: 18px; color: var(--ink-soft); margin-top: 12px">
          Pick a game type to open the editor — set up your rounds, then host it.
        </p>
      </div>
      <div class="grid" style="padding: 14px 0 40px">
        <NuxtLink v-for="t in types" :key="t.id" :to="`/editor/${t.id}`" class="card">
          <div class="card-body">
            <div class="card-title">{{ t.name }}</div>
            <p style="color: var(--ink-soft); font-size: 14px; line-height: 1.5; min-height: 56px">
              {{ t.description }}
            </p>
            <span class="btn btn-primary btn-sm">Set up &amp; host</span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </main>
</template>
