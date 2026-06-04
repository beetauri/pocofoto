import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

function getGitCommit() {
  if (process.env.CF_PAGES_COMMIT_SHA) {
    return process.env.CF_PAGES_COMMIT_SHA.slice(0, 7)
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: new URL('.', import.meta.url),
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim()
  } catch {
    return 'dev'
  }
}

const buildVersion = packageJson.version || '0.0.0'
const buildCommit = getGitCommit()

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion),
    'import.meta.env.VITE_APP_COMMIT': JSON.stringify(buildCommit)
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'vendor-firebase';
          if (id.includes('/framer-motion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) return 'vendor-motion';
          if (id.includes('/@modelcontextprotocol/')) return 'vendor-mcp';
          if (id.includes('/zod/')) return 'vendor-zod';
          if (id.includes('/@medv/') || id.includes('/parsel-js/') || id.includes('/ws/')) return 'vendor-retune-support';
          if (id.includes('/retune/')) return 'vendor-retune';
          if (id.includes('/workbox-') || id.includes('/vite-plugin-pwa/')) return 'vendor-pwa';
        }
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['pocofoto-logotype.svg', 'pocoface-icon-1024.png', 'pocoface-192.png', 'pocoface-512.png'],
      manifest: {
        name: 'Pocofoto — Photo Sharing for Two',
        short_name: 'Pocofoto',
        description: 'Share photos with the person you love, instantly.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'fullscreen',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pocoface-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pocoface-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pocoface-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-storage-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
})
