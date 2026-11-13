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
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'logo.png', 'gio-da-sorte-logo-only.png'],
        manifest: {
          id: './',
          name: 'GIO DA SORTE',
          short_name: 'GIODASORTE',
          description: 'GIO DA SORTE - Sistema de sorteio proporcional por moedas e bilhetes da sorte com roleta e animações.',
          theme_color: '#0131CD',
          background_color: '#080D18',
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
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: [
            '**/*.{js,mjs,css,html,ico,png,jpg,jpeg,webp,gif,svg,avif,woff,woff2,ttf,otf,eot,webmanifest}',
          ],
          globIgnores: ['**/404.html', '**/*.zip'],
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
              urlPattern: ({ request, url, sameOrigin }) => {
                const isExcludedPath =
                  url.pathname.startsWith('/api/') ||
                  url.pathname.startsWith('/__') ||
                  url.pathname.startsWith('/_aistudio');
                if (isExcludedPath) return false;
                return (
                  request.destination === 'script' ||
                  request.destination === 'style' ||
                  request.destination === 'font' ||
                  request.destination === 'worker' ||
                  request.destination === 'manifest' ||
                  /\.(?:js|mjs|cjs|css|woff2?|ttf|otf|eot|webmanifest|map)$/i.test(url.pathname) ||
                  (sameOrigin &&
                    (url.pathname.startsWith('/assets/') || /\.json$/i.test(url.pathname)))
                );
              },
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'gio-static-assets-cache',
                expiration: {
                  maxEntries: 250,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: ({ request, url }) => {
                const isExcludedPath =
                  url.pathname.startsWith('/api/') ||
                  url.pathname.startsWith('/__') ||
                  url.pathname.startsWith('/_aistudio');
                if (isExcludedPath) return false;
                return (
                  request.destination === 'image' ||
                  /\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp|tiff?)$/i.test(url.pathname)
                );
              },
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'gio-images-cache',
                expiration: {
                  maxEntries: 300,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: ({ request, url }) => {
                const isExcludedPath =
                  url.pathname.startsWith('/api/') ||
                  url.pathname.startsWith('/__') ||
                  url.pathname.startsWith('/_aistudio');
                if (isExcludedPath) return false;
                return (
                  request.destination === 'audio' ||
                  request.destination === 'video' ||
                  /\.(?:mp3|wav|ogg|webm|mp4)$/i.test(url.pathname)
                );
              },
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'gio-media-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
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
