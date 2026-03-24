import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // './' fuer Exchange-Server, '/protokollbrowser/bf/' fuer BF-Build, '/protokollbrowser/' fuer GitHub Pages
  base: process.env.VITE_BASE === 'server' ? './' : process.env.VITE_BASE === 'bf' ? '/protokollbrowser/bf/' : '/protokollbrowser/',
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(Date.now().toString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'sw2.js',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        globIgnores: ['**/version.txt'],
        navigateFallbackDenylist: [/version\.txt$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-osm',
              expiration: { maxEntries: 5000, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/wmtsod\d\.bayernwolke\.de\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-bayern',
              expiration: { maxEntries: 5000, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Protokoll-App',
        short_name: 'Protokoll',
        description: 'Mobile Protokollerfassung für DOCUframe',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
