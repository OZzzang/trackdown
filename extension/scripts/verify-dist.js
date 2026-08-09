// Post-build guard.
//
// manifest.json references files by exact path, and so does the service worker when it
// creates the offscreen document. If Vite ever starts content-hashing those filenames
// again, nothing throws — the extension loads and the worker simply never runs. 
// This turns it into a failed build.
//
// Run automatically as part of `npm run build`.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const problems = [];

function check(path, why) {
  if (!existsSync(join(dist, path))) problems.push(`${why}: dist/${path} does not exist`);
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

check(manifest.background.service_worker, 'manifest.background.service_worker');
check(manifest.action.default_popup, 'manifest.action.default_popup');

// Every script/style the two HTML shells pull in. Vite writes these as root-absolute
// paths, which resolve against the extension root at runtime.
for (const html of ['popup.html', 'offscreen.html']) {
  check(html, 'html entry');
  const source = readFileSync(join(dist, html), 'utf8');
  for (const [, ref] of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
    check(ref.replace(/^\//, ''), `${html} reference`);
  }
}

// The offscreen document is created by URL from the service worker, so that string is a
// hard dependency too — but it lives in JS, where the check above cannot see it.
check('offscreen.js', 'offscreen entry');

// A module service worker resolves its static imports against the extension root, and code
// shared with the other contexts is emitted as a separate chunk. A missing one is the same
// silent failure as a hashed worker: the extension loads, the worker never runs.
const worker = readFileSync(join(dist, 'service-worker.js'), 'utf8');
for (const [, specifier] of worker.matchAll(/^import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
  check(specifier.replace(/^\.\//, ''), 'service-worker import');
}

if (problems.length > 0) {
  console.error('\nBuild output is missing files referenced by exact path:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nMost likely cause: content hashing re-enabled in vite.config.js.\n');
  process.exit(1);
}

console.log('verify-dist: all exact-path references resolve');
