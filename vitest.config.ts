import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// The Vue plugin lets tests import block modules that reference .vue views
// (the aggregate logic under test lives alongside those components).
export default defineConfig({
  plugins: [vue()],
  test: {
    // apps/web coverage is the plain-TS server utils only (no nuxt context needed).
    include: ['packages/**/*.{test,spec}.ts', 'apps/web/server/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.nuxt/**'],
    environment: 'node',
  },
})
