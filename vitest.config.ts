import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// The Vue plugin lets tests import block modules that reference .vue views
// (the aggregate logic under test lives alongside those components).
export default defineConfig({
  plugins: [vue()],
  test: {
    // apps/web coverage is plain-TS that needs no nuxt context: the server utils and a
    // few self-contained composables (e.g. the host-session lifecycle).
    include: [
      'packages/**/*.{test,spec}.ts',
      'apps/web/server/**/*.{test,spec}.ts',
      'apps/web/app/composables/**/*.{test,spec}.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.nuxt/**'],
    environment: 'node',
  },
})
