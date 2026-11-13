import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: './',
          name: 'GIO DA SORTE',
          short_name: 'GIODASORTE',
          description: 'GIO DA SORTE - Sistema de sorteio proporcional por moedas e bilhetes da sorte com roleta e animações.',
          theme_color: '#0131CD',
          background_color: '#080A0F',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: './',
          scope: './',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15 MiB
          navigateFallbackDenylist: [/^\/api\//, /^\/__/, /^\/_aistudio/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/api/') ||
                url.pathname.startsWith('/__') ||
                url.pathname.startsWith('/_aistudio'),
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ request, url }) =>
                !url.pathname.startsWith('/api/') &&
                (request.destination === 'script' ||
                  request.destination === 'style' ||
                  request.destination === 'font' ||
                  /\.(?:js|mjs|css|woff2?|ttf|eot)$/i.test(url.pathname)),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'gio-static-assets-cache',
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: ({ request, url }) =>
                !url.pathname.startsWith('/api/') &&
                (request.destination === 'image' ||
                  /\.(?:png|jpe?g|webp|gif|svg|ico|avif)$/i.test(url.pathname)),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'gio-images-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Keep file watching active on source files so Vite invalidates modified modules in memory without manual server restarts.
      watch: {
        ignored: ['**/node_modules/**', '**/dist/**', '**/.backups/**', '**/.git/**'],
      },
    },
  };
});
