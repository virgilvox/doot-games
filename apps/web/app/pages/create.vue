<script setup lang="ts">
import { gameCatalog } from '@doot-games/games/catalog'
import { GameTypeIcon } from '@doot-games/ui'

// Every game type is an authorable template here; "Games From Doot" (ready to
// play) live on Explore instead.
const types = gameCatalog
</script>

<template>
  <main>
    <div class="wrap">
      <div class="create-head">
        <span class="kicker">Build something</span>
        <h1>Start a new game</h1>
        <p>
          Pick a type to open the editor, then add your content and pick a theme. <b>Custom</b> lets you mix any
          round types in one game. Rather describe it in words? In the editor, hit <b>Import</b> to paste a short
          spec — or copy a one-click prompt and have ChatGPT or Claude write it for you. No account needed to host;
          you only sign in to save a shareable link.
        </p>
      </div>
      <div class="typegrid">
        <NuxtLink v-for="t in types" :key="t.id" :to="`/editor/${t.id}`" class="typecard">
          <GameTypeIcon :type="t.id" :size="54" />
          <h3>{{ t.name }}</h3>
          <p>{{ t.description }}</p>
          <div class="tfoot">
            <span class="cap mono">v{{ t.version }}<span v-if="t.flagship"> · Game From Doot</span></span>
            <span class="btn btn-primary btn-sm">Use this</span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.create-head {
  text-align: center;
  padding: 40px 0 8px;
}
.create-head h1 {
  font-size: clamp(32px, 6vw, 46px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-top: 8px;
}
.create-head p {
  font-size: 18px;
  color: var(--ink-soft);
  margin-top: 12px;
  max-width: 60ch;
  margin-inline: auto;
}
.typegrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  padding: 24px 0 48px;
}
.typecard {
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  padding: 22px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.12s, box-shadow 0.12s;
  display: block;
  text-decoration: none;
  color: inherit;
}
.typecard:hover {
  transform: translate(-2px, -3px);
  box-shadow: var(--shadow);
}
.typecard h3 {
  font-size: 23px;
  font-weight: 800;
  margin: 16px 0 7px;
}
.typecard p {
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin-bottom: 18px;
  min-height: 62px;
}
.tfoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.tfoot .cap {
  font-size: 11px;
  color: var(--mute);
  letter-spacing: 0.04em;
}
</style>
