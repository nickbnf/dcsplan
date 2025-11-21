import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    },
  },
})
