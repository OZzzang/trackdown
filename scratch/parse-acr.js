#!/usr/bin/env node
/*
 * Normalize an ACRCloud response into the SAME contract as parse.js, so the two providers
 * can be compared field for field.
 *
 *   ./identify-acr.sh clip.webm | node parse-acr.js
 *
 * The one field ACRCloud gives that AudD does not is `score` — a confidence value. That
 * alone may decide the provider question: it is the thing that would let the server tell
 * a shaky match from a solid one.
 */

const fs = require('fs');

function normalize(raw) {
  const code = raw?.status?.code;

  // 1001 is ACRCloud's "no result" — a successful request with nothing found.
  if (code === 1001) return { found: false };
  if (code !== 0 && code !== undefined) {
    throw new Error(`ACRCloud error ${code}: ${raw.status.msg ?? 'unknown'}`);
  }

  const m = raw?.metadata?.music?.[0];
  if (!m) return { found: false };

  const ext = m.external_metadata || {};
  const spotifyId = ext.spotify?.track?.id;
  const appleId = ext.apple_music?.track?.id;

  return {
    found: true,
    title: m.title ?? null,
    artist: m.artists?.map(a => a.name).join(', ') || null,
    album: m.album?.name ?? null,
    releaseDate: m.release_date ?? null,
    // ACRCloud returns provider IDs rather than URLs, and no artwork.
    albumArt: null,
    spotifyUrl: spotifyId ? `https://open.spotify.com/track/${spotifyId}` : null,
    appleMusicUrl: appleId ? `https://music.apple.com/us/album/_/${appleId}` : null,
    score: m.score ?? null,
  };
}

function main() {
  const file = process.argv[2];
  const text = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    console.error('Not JSON — check the endpoint and signature. Raw body:\n');
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  let out;
  try {
    out = normalize(raw);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log(JSON.stringify(out, null, 2));

  if (!out.found) {
    console.error('\n→ No match.');
  } else {
    if (out.score !== null) console.error(`\nconfidence score: ${out.score}`);
    const missing = ['title', 'artist', 'album', 'releaseDate', 'spotifyUrl']
      .filter(k => out[k] === null);
    if (missing.length) console.error(`⚠ null after mapping: ${missing.join(', ')}`);
  }
  if (raw._seconds !== undefined) console.error(`round trip: ${raw._seconds}s`);
}

main();
