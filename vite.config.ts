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
      registerType: 'prompt',
      // Fonts are bundled, not fetched — a PWA used in a gym basement cannot
      // depend on a CDN. Precaching them is the whole point.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
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
