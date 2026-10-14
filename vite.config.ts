import { defineConfig } from 'vite';

// Source entry is game.html. `npm run build` makes a normal multi-file build in dist/;
// `npm run pages` makes the single self-contained index.html that GitHub Pages serves from main.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: 'game.html',
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  server: { host: true, open: '/game.html' },
});
