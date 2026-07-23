import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        // firebase is large; keeping it out of the entry chunk means the word
        // list still renders fast for signed-out users. This project's Vite
        // (8.x, rolldown-based) only supports the function form of
        // manualChunks — the classic `{ firebase: [...] }` record form does
        // not type-check here — so the same grouping is expressed as a
        // predicate over the module id.
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
  },
});
