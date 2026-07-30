import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Three entry points, one per extension context. Two of them are referenced by exact
// filename — `service-worker.js` from manifest.json, and the offscreen document's URL
// from the service worker — so the default content hashing has to go. A hashed
// `service-worker.a1b2c3.js` fails silently: the extension loads, the worker never runs.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The service worker and offscreen doc are hand-written vanilla JS. Minifying them
    // buys nothing (they never travel over a network) and makes chrome://extensions
    // stack traces unreadable.
    minify: false,
    rollupOptions: {
      // The two HTML shells sit at the extension root, not beside their JS. Vite emits an
      // HTML entry at its path relative to the project root, so `src/popup/index.html`
      // would land in `dist/src/popup/` — a build output that reads like source, and a
      // manifest path that looks like it points at an uncompiled file.
      input: {
        popup: 'popup.html',
        offscreen: 'offscreen.html',
        'service-worker': 'src/background/service-worker.js',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
