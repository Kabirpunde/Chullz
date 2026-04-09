import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',  // Changed from autoUpdate to prevent auto-refresh
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Chullz Poker',
        short_name: 'Chullz',
        description: '3-Board Texas Hold\'em Multiplayer Poker',
        theme_color: '#060b14',
        background_color: '#060b14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Disable runtime caching to prevent stale cache issues
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,  // Disable PWA in dev mode
      },
    }),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: false,
    watch: {
      ignored: ['**/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
