import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    // Base URL for GitHub Pages (repo name) - Changed to relative for safer local dev
    base: './',
    // Per-build id, appended to the opencv-worker URL: the worker file has a
    // stable name, and the service worker's cache-first once pinned users to
    // an outdated slicing engine across deploys.
    define: {
      __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    // @jsquash/webp ships wasm that esbuild's dev pre-bundling breaks;
    // it is dynamically imported only on browsers without native WebP encode.
    // (opencv.js is deliberately NOT bundled at all — see scripts/copy-opencv.mjs.)
    optimizeDeps: {
      exclude: ['@jsquash/webp'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            genai: ['@google/genai'],
            zip: ['jszip', 'upng-js'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    }
  };
});
