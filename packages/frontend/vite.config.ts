import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Single-origin dev proxy (D6): mirror the prod Caddy rule — /api -> backend,
  // with the /api prefix stripped so the backend serves at its own paths.
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        // Pass the WebSocket upgrade through for the plan-sync socket
        // (/api/sync/{planId}, add-cloud-sync AD-14).
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // @ts-ignore - vitest config extension
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  resolve: {
    alias: {
      // Mock @plausible-analytics/tracker for tests
      '@plausible-analytics/tracker': path.resolve(__dirname, './src/test/mocks/plausible.ts'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
})
