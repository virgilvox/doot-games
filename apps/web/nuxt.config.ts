import { allThemesCss } from '@doot-games/themes'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: false },

  // Optional, non-blocking auth (sealed-cookie sessions, no server store).
  modules: ['nuxt-auth-utils'],

  // Workspace packages ship TypeScript/SFC source; let Nuxt transpile them.
  build: {
    transpile: [
      '@doot-games/engine',
      '@doot-games/sdk',
      '@doot-games/ui',
      '@doot-games/games',
      '@doot-games/themes',
    ],
  },

  css: ['@doot-games/themes/base.css', '@doot-games/ui/styles.css'],

  app: {
    head: {
      title: 'Doot — put a game on the big screen',
      htmlAttrs: { 'data-theme': 'doot' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content:
            'Self-hostable live party games. Host on a screen, everyone joins from their phone.',
        },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Figtree:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap',
        },
      ],
      // Inject the generated theme tokens server-side so there is no FOUC.
      style: [{ id: 'doot-theme-vars', innerHTML: allThemesCss() }],
    },
  },

  runtimeConfig: {
    // Seals the session cookie. Set SESSION_PASSWORD (32+ chars) in production;
    // the dev fallback only keeps local sessions stable across restarts.
    session: {
      password:
        process.env.SESSION_PASSWORD ||
        process.env.NUXT_SESSION_PASSWORD ||
        'doot-dev-session-password-change-me-32',
    },
    public: {
      relayUrl: process.env.CLASP_RELAY_URL || 'wss://relay.clasp.to',
      baseUrl: process.env.PUBLIC_BASE_URL || '',
    },
  },
})
