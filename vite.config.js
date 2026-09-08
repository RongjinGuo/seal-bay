import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // Three.js is cached independently of game updates.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules\/three/ }] },
      },
    },
  },
});
