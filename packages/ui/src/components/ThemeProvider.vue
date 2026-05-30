<script setup lang="ts">
/**
 * Applies a Doot theme globally: sets `data-theme` on the document root so
 * token rules take effect, and injects the generated theme stylesheet once.
 * The TS token objects in @doot-games/themes are the single source of truth.
 * Use one provider per app and change its `themeId` to switch themes (it does
 * not scope a subtree, it drives the document root). See PRD section 9.
 */
import { allThemesCss, getTheme } from '@doot-games/themes'
import { computed, onMounted, watchEffect } from 'vue'

const props = withDefaults(defineProps<{ themeId?: string | null }>(), { themeId: 'doot' })

const theme = computed(() => getTheme(props.themeId))

function ensureThemeStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById('doot-theme-vars')) return
  const el = document.createElement('style')
  el.id = 'doot-theme-vars'
  el.textContent = allThemesCss()
  document.head.appendChild(el)
}

watchEffect(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme.value.id)
  }
})

onMounted(ensureThemeStyles)
</script>

<template>
  <slot :theme="theme" />
</template>
