// ACRCloud adapter — production provider. See docs/DECISIONS.md (2026-07-27): measured
// 10/10 against AudD's 6/10 on the same ten clips, with zero confidently-wrong answers.
//
// Ships alongside audd.js and is selected by PROVIDER, so the choice stays a config value
// rather than a dependency. As with audd.js, nothing ACRCloud-specific leaves this file.
//
// Ported from scratch/parse-acr.js and scratch/identify-acr.sh, both verified in Phase 0.

import { createHmac } from 'node:crypto';
import { UpstreamError } from './upstream-error.js';

const URI = '/v1/identify';
const TIMEOUT_MS = 15_000;

// ACRCloud's "no result" status. A successful request that matched nothing.
const NO_RESULT = 1001;

export const name = 'acrcloud';

// The signed string is six newline-separated fields in this exact order with no trailing
// newline. Any deviation returns a 3003 signature error.
function sign({ accessKey, accessSecret, timestamp }) {
  const stringToSign = ['POST', URI, accessKey, 'audio', '1', timestamp].join('\n');
  return createHmac('sha1', accessSecret).update(stringToSign).digest('base64');
}

export function normalize(raw) {
  const code = raw?.status?.code;

  if (code === NO_RESULT) return { found: false };
  if (code !== 0 && code !== undefined) {
    throw new UpstreamError(`ACRCloud error ${code}: ${raw.status?.msg ?? 'unknown'}`);
  }

  const music = raw?.metadata?.music?.[0];
  if (!music) return { found: false };

  const external = music.external_metadata ?? {};
  const spotifyId = external.spotify?.track?.id;
  const appleId = external.apple_music?.track?.id;

  return {
    found: true,
    title: music.title ?? null,
    artist: music.artists?.map((a) => a.name).join(', ') || null,
    album: music.album?.name ?? null,
    releaseDate: music.release_date ?? null,
    // ACRCloud returns provider IDs rather than URLs, and no artwork at all. Left null on
    // purpose: services/index.js fills it from the iTunes Search API on the way out, so the
    // repair lives at the seam and this adapter stays a faithful record of what ACRCloud
    // actually said.
    albumArt: null,
    spotifyUrl: spotifyId ? `https://open.spotify.com/track/${spotifyId}` : null,
    appleMusicUrl: appleId ? `https://music.apple.com/us/album/_/${appleId}` : null,
    // The one field AudD does not provide. Kept because it is genuinely useful for logging
    // and future thresholding — but the popup still hedges unconditionally, so that copy
    // does not change depending on which provider answered.
    confidence: music.score ?? null,
  };
}

export async function identify(buffer, filename) {
  const host = process.env.ACR_HOST;
  const accessKey = process.env.ACR_ACCESS_KEY;
  const accessSecret = process.env.ACR_ACCESS_SECRET;

  if (!host || !accessKey || !accessSecret) {
    throw new UpstreamError('ACR_HOST, ACR_ACCESS_KEY or ACR_ACCESS_SECRET is not set');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();

  const form = new FormData();
  form.append('sample', new Blob([buffer]), filename);
  form.append('sample_bytes', String(buffer.length));
  form.append('access_key', accessKey);
  form.append('data_type', 'audio');
  form.append('signature_version', '1');
  form.append('signature', sign({ accessKey, accessSecret, timestamp }));
  form.append('timestamp', timestamp);

  let response;
  try {
    response = await fetch(`https://${host}${URI}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new UpstreamError(`ACRCloud request failed: ${err.message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`ACRCloud returned HTTP ${response.status}`);
  }

  let raw;
  try {
    raw = await response.json();
  } catch {
    throw new UpstreamError('ACRCloud returned a non-JSON body');
  }

  return normalize(raw);
}
