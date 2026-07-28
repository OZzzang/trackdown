#!/usr/bin/env node
/*
 * TrackDown Phase 0 — normalize an AudD response into OUR contract.
 *
 *   ./identify.sh clip.webm > raw.json && node parse.js raw.json
 *   ./identify.sh clip.webm | node parse.js
 *
 * This is a spike, but it is deliberately the DRAFT of server/src/services/audd.js:
 * the shape it emits is the one PLAN.md:92 pins down, and validating that mapping
 * against real responses now is cheaper than discovering a wrong field in Phase 1C.
 *
 * It also prints unmapped keys, so a wrong guess about AudD's shape surfaces loudly
 * instead of silently becoming `undefined` in the popup.
 */

const fs = require('fs');

const NORMALIZED_KEYS = [
  'found', 'title', 'artist', 'album',
  'releaseDate', 'albumArt', 'spotifyUrl', 'appleMusicUrl',
];

// Apple Music artwork URLs embed {w}x{h} placeholders that MUST be substituted or
// the <img> 404s. Easy to miss until it's a broken image in the popup.
function appleArtwork(art) {
  if (!art?.url) return null;
  return art.url.replace('{w}', '300').replace('{h}', '300');
}

function normalize(raw) {
  if (raw?.status === 'error') {
    const e = raw.error || {};
    throw new Error(`AudD error ${e.error_code ?? '?'}: ${e.error_message ?? 'unknown'}`);
  }

  // No match is a SUCCESS with a null result — not an error, not a 404.
  // CLAUDE.md: the route must return 200 { found: false }.
  const r = raw?.result;
  if (!r) return { found: false };

  const spotify = r.spotify || {};
  const apple = r.apple_music || {};

  return {
    found: true,
    title: r.title ?? null,
    artist: r.artist ?? null,
    // Prefer the provider sub-objects; AudD's top-level album is often missing.
    album: r.album ?? spotify.album?.name ?? apple.albumName ?? null,
    releaseDate: r.release_date ?? spotify.album?.release_date ?? apple.releaseDate ?? null,
    albumArt: spotify.album?.images?.[0]?.url ?? appleArtwork(apple.artwork) ?? null,
    spotifyUrl: spotify.external_urls?.spotify ?? null,
    appleMusicUrl: apple.url ?? null,
  };
}

function report(raw, out) {
  console.log(JSON.stringify(out, null, 2));

  if (!out.found) {
    console.error('\n→ No match. Expected for live covers, remixes, heavy speech overlay.');
    return;
  }

  const missing = NORMALIZED_KEYS.filter(k => out[k] === null);
  if (missing.length) {
    console.error(`\n⚠ null after mapping: ${missing.join(', ')}`);
    console.error('  Popup must render without these — do not assume they exist.');
  }

  // Anything AudD sent that we never read. Either genuinely unused, or a mapping bug.
  const seen = new Set([
    'title', 'artist', 'album', 'release_date', 'spotify', 'apple_music',
    'score', 'song_link', 'label', 'timecode',
  ]);
  const unmapped = Object.keys(raw.result || {}).filter(k => !seen.has(k));
  if (unmapped.length) console.error(`\nℹ unmapped AudD keys: ${unmapped.join(', ')}`);

  if (raw.result?.score !== undefined) console.error(`\nmatch score: ${raw.result.score}`);
  if (raw._seconds !== undefined) console.error(`round trip: ${raw._seconds}s`);
}

function main() {
  const file = process.argv[2];
  const text = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    console.error('Not JSON — AudD probably returned an error page. Raw body:\n');
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  try {
    report(raw, normalize(raw));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
