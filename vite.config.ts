import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// Vitest's defineConfig, not Vite's — it is the one that knows about `test`.
import { defineConfig } from 'vitest/config'

/**
 * Build identity, baked in at compile time.
 *
 * The point is answering "which version is my phone actually running" after a
 * deploy — a service worker can serve a cached build for a while, so the
 * question is a real one rather than idle curiosity.
 *
 * Every lookup is defensive. A CI checkout is often shallow or has no git at
 * all, and a missing build number must degrade to something harmless rather
 * than failing the build.
 */
function git(command: string, fallback: string): string {
  try {
    return execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return fallback
  }
}

/** Commit count: a genuine monotonic build number, tied to history. */
const buildNumber = Number(git('rev-list --count HEAD', '0')) || 0

const commit =
  process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ??
  process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ??
  git('rev-parse --short HEAD', 'local')

const buildTime = new Date().toISOString()

export default defineConfig({
  define: {
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
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
