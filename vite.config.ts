import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// Vitest's defineConfig, not Vite's — it is the one that knows about `test`.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // autoUpdate, not prompt: an installed PWA is rarely fully closed, so a
      // waiting service worker can sit there for weeks and you stay stuck on
      // the version you first installed. Auto-updating is safe here because
      // every set is written to IndexedDB the moment it is logged and an
      // interrupted session is recovered on launch — the worst case is a
      // reload that puts you back exactly where you were.
      //
      // M5 can replace this with a polite "update ready" prompt that waits for
      // a moment you are not mid-set.
      registerType: 'autoUpdate',
      // Fonts are bundled, not fetched — a PWA used in a gym basement cannot
      // depend on a CDN. Precaching them is the whole point.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Client-side routes must fall back to the shell, so a refresh on
        // /history/<id> works offline as well as online.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Gymmy',
        short_name: 'Gymmy',
        description: 'Log your sets. Build your plan. Watch the numbers go up.',
        theme_color: '#14110F',
        background_color: '#14110F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
