import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Where the extension sends audio, decided by build mode rather than by editing source.
//
// `npm run dev` passes --mode development and gets the local server; `npm run build` gets
// production. The point is that neither build can be shipped wearing the other's config —
// an extension published pointing at localhost works perfectly on the developer's machine
// and fails for every single user, which is the worst shape a bug can have.
const API_ORIGIN = {
  development: 'http://localhost:3000',
  production: 'https://trackdown-wcvk.onrender.com',
};

// The origin has to reach TWO places that must agree: the fetch in offscreen.js, and
// `host_permissions` in the manifest. A fetch to a host missing from host_permissions is
// blocked before it leaves, and the failure reads as the server being down — so a mismatch
// costs an afternoon chasing a network bug that is really a manifest bug.
//
// host_permissions is therefore NOT written in public/manifest.json at all. It is generated
// here, and verify-dist.js fails the build if it is missing or disagrees with the bundle.
// Deliberately fails loud: a manifest with no host permission refuses every request, which
// is far easier to diagnose than one quietly pointing at the wrong environment.
function writeHostPermissions(origin) {
  return {
    name: 'trackdown:host-permissions',
    closeBundle() {
      const path = fileURLToPath(new URL('./dist/manifest.json', import.meta.url));
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.host_permissions = [`${origin}/*`];
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

// Three entry points, one per extension context. Two of them are referenced by exact
// filename — `service-worker.js` from manifest.json, and the offscreen document's URL
// from the service worker — so the default content hashing has to go. A hashed
// `service-worker.a1b2c3.js` fails silently: the extension loads, the worker never runs.
export default defineConfig(({ mode }) => {
  const origin = API_ORIGIN[mode] ?? API_ORIGIN.production;

  return {
    plugins: [react(), writeHostPermissions(origin)],
    // Inlined at build time, so no source file names an environment.
    define: { __API_ORIGIN__: JSON.stringify(origin) },
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
  };
});
