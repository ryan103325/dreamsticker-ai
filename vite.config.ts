import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    // Base URL for GitHub Pages (repo name) - Changed to relative for safer local dev
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    // @jsquash/webp ships wasm that esbuild's dev pre-bundling breaks;
    // it is dynamically imported only on browsers without native WebP encode.
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
