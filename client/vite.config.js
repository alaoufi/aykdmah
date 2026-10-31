import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import lightTheme from './src/theme/themes/default';
import darkTheme from './src/theme/themes/dark';
import { themeToCssVars } from './src/theme/tokens';
import { compatibilityAssetsPlugin } from './build-tools/compatibilityAssets.mjs';
import { earlyRecoveryPlugin } from './build-tools/earlyRecovery.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:5000';
  const themeCss = (theme) => themeToCssVars(theme).map(([name, value]) => `${name}:${value}`).join(';');

  return {
    plugins: [
      {
        name: 'ayk-theme-tokens',
        transformIndexHtml() {
          return [{
            tag: 'style', attrs: { id: 'ayk-theme-tokens' }, injectTo: 'head',
            children: `:root{${themeCss(lightTheme)};color-scheme:light}:root[data-theme="dark"]{${themeCss(darkTheme)};color-scheme:dark}`,
          }];
        },
      },
      react(),
      earlyRecoveryPlugin(),
      // The deployed version, read by UpdateBar to offer "Update now" (AYK-053).
      {
        name: 'ayk-version-file',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: env.VITE_APP_VERSION || '' }) });
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['offline.js', 'theme-init.js', 'offline.html', 'favicon.ico', 'icons/favicon-16.png', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/android-chrome-192x192.png', 'icons/android-chrome-512x512.png', 'icons/app-icon-192.png', 'icons/app-icon-512.png', 'icons/app-icon-maskable-192.png', 'icons/app-icon-maskable-512.png', 'brand/aykdmh-logo-256.webp', 'brand/aykdmh-logo.webp'],
        // Replace the old SW immediately + claim open tabs so a stale
        // index.html doesn't keep pointing at chunks that no longer
        // exist after a redeploy ("Failed to fetch dynamically imported
        // module …").
        manifest: {
          name: 'أي خدمة',
          short_name: 'أي خدمة',
          description: 'منصة خدمات محلية — خدمة أسرع، حياة أسهل',
          theme_color: '#0B2D56',
          background_color: '#FAF7F2',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          lang: 'ar',
          dir: 'rtl',
          icons: [
            // The owner's app logo (AYK-072): plain, and a "maskable" one on white for Android's round icons.
            { src: '/icons/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/app-icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/app-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globIgnores: ['version.json', 'install/refresh.html', 'refresh-site.js', 'assets/*.wasm', 'assets/*.mjs', 'assets/localLanguage.worker-*.js'],
          // Incoming-call notifications (AYK-008).
          importScripts: ['push-sw.js'],
          // The main bundle passed the 2 MiB default; it must stay in the offline cache.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/install/, /^\/uploads/, /^\/dl\//],
          runtimeCaching: [
            // API responses contain account, chat and request data; always use
            // the network and never retain them across logout or account changes.
            { urlPattern: ({ url }) => /^\/(?:api|uploads|install)(?:\/|$)/.test(url.pathname), handler: 'NetworkOnly' },
            {
              // Same-origin only: the worker's fetch obeys the page CSP connect-src, so routing
              // cross-origin images (map tiles, previews) through it made them fail to load.
              urlPattern: ({ request, url }) => request.destination === 'image' && url.origin === self.location.origin,
              handler: 'CacheFirst',
              options: {
                cacheName: 'public-images-v2',
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
      }),
      compatibilityAssetsPlugin(),
    ],
    worker: { format: 'es' },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true },
        '/uploads': { target: apiUrl, changeOrigin: true },
        '/install': { target: apiUrl, changeOrigin: true },
        '/socket.io': { target: apiUrl, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'leaflet-vendor': ['leaflet', 'react-leaflet'],
            'socket-vendor': ['socket.io-client'],
          },
        },
      },
    },
  };
});
