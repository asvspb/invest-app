import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite config: dev-server с proxy к Express (:7777), билд в dist/
// Dev: Vite :5173 (HMR) → /api/* проксируется на Express
// Prod: npm run build → dist/ (фронт); Express раздаёт dist/ + /api/*
export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@calc': resolve(__dirname, 'src/calculators')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:7777',
        changeOrigin: true
      }
    }
  }
});
