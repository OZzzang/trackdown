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

// Icons are copied verbatim out of public/, so nothing in the build would notice one being
// renamed or deleted. Chrome does not complain either — it silently substitutes a generated
// letter tile, which looks enough like an icon that you can ship without realising yours is
// gone. The Web Store rejects a submission missing the 128, so catch it here instead.
for (const [size, path] of Object.entries(manifest.icons ?? {})) {
  check(path, `manifest.icons["${size}"]`);
}
for (const [size, path] of Object.entries(manifest.action.default_icon ?? {})) {
  check(path, `manifest.action.default_icon["${size}"]`);
}
if (!manifest.icons?.['128']) {
  problems.push('manifest.icons is missing the 128 — the Web Store requires it');
}

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

// The API origin is written into two places by vite.config.js — the manifest's
// host_permissions and the fetch inside offscreen.js — and Chrome blocks the request if they
// disagree. That failure surfaces in the popup as "Can't reach TrackDown", which sends you
// looking at the server rather than at the build, so it is worth catching here instead.
const hosts = manifest.host_permissions ?? [];
if (hosts.length === 0) {
  problems.push('manifest.host_permissions is empty — vite.config.js did not write it');
} else {
  const offscreen = readFileSync(join(dist, 'offscreen.js'), 'utf8');
  for (const pattern of hosts) {
    const origin = pattern.replace(/\/\*$/, '');
    if (!offscreen.includes(origin)) {
      problems.push(
        `host_permissions grants ${origin} but offscreen.js never calls it — ` +
          'the manifest and the bundle were built against different origins',
      );
    }
  }
}

if (problems.length > 0) {
  console.error('\nBuild output failed verification:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    '\nA missing file usually means content hashing was re-enabled in vite.config.js.' +
      '\nAn origin mismatch means the manifest and the bundle were built separately.\n',
  );
  process.exit(1);
}

console.log('verify-dist: all exact-path references resolve');
