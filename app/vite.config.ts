import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// ----- Build-Metadaten -----
const _now = new Date()
const _pad = (n: number) => String(n).padStart(2, '0')
const BUILD_DATE = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())} ${_pad(_now.getHours())}:${_pad(_now.getMinutes())}`

// Deterministisches Codewort (Tier + Material) fuer einfache Erkennung
const _tiere = ['Adler', 'Biber', 'Dachs', 'Eule', 'Fuchs', 'Gans', 'Hirsch', 'Igel', 'Kranich', 'Luchs', 'Marder', 'Otter', 'Pinguin', 'Reh', 'Specht', 'Uhu', 'Wolf', 'Zebra']
const _materialien = ['Kupfer', 'Silber', 'Gold', 'Bronze', 'Quarz', 'Jade', 'Opal', 'Topas', 'Rubin', 'Smaragd', 'Saphir', 'Amber', 'Koralle', 'Perle', 'Onyx', 'Achat', 'Lava', 'Kiesel']
const _t = _now.getTime()
const BUILD_CODE = `${_tiere[Math.floor(_t / 60000) % _tiere.length]}-${_materialien[Math.floor(_t / 600000) % _materialien.length]}`

export default defineConfig({
  // Default = Server-Build ('./'), damit ein versehentliches 'npm run build'
  // nie wieder einen GitHub-Pages-Build ins server/pwa/-Deploy schreibt.
  // VITE_BASE=pages -> '/protokollbrowser/' fuer GitHub Pages
  // VITE_BASE=bf    -> '/protokollbrowser/bf/' fuer BF-Build
  base: process.env.VITE_BASE === 'pages' ? '/protokollbrowser/' : process.env.VITE_BASE === 'bf' ? '/protokollbrowser/bf/' : './',
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(BUILD_DATE),
    'import.meta.env.VITE_BUILD_CODE': JSON.stringify(BUILD_CODE),
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
        description: `Mobile Protokollerfassung für DOCUframe — Build ${BUILD_DATE} ${BUILD_CODE}`,
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
