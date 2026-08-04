// AudD adapter — development provider. See docs/DECISIONS.md (2026-07-27).
//
// Everything AudD-specific lives in this file: its endpoint, its auth, and the shape of its
// response. Nothing above services/ may know which provider answered, so the only thing
// leaving here is the normalized contract.
//
// Ported from scratch/parse.js, which was validated against real responses in Phase 0.

import { UpstreamError } from './upstream-error.js';

const ENDPOINT = 'https://api.audd.io/';
const TIMEOUT_MS = 15_000;

export const name = 'audd';

// Apple Music artwork URLs embed {w}x{h} placeholders that must be substituted or the
// <img> 404s. Easy to miss until it is a broken image in the popup.
function appleArtwork(artwork) {
  if (!artwork?.url) return null;
  return artwork.url.replace('{w}', '300').replace('{h}', '300');
}

export function normalize(raw) {
  if (raw?.status === 'error') {
    const error = raw.error ?? {};
    throw new UpstreamError(
      `AudD error ${error.error_code ?? '?'}: ${error.error_message ?? 'unknown'}`
    );
  }

  // No match is a SUCCESS with a null result — not an error, not a 404.
  const result = raw?.result;
  if (!result) return { found: false };

  const spotify = result.spotify ?? {};
  const apple = result.apple_music ?? {};

  return {
    found: true,
    title: result.title ?? null,
    artist: result.artist ?? null,
    // Prefer the provider sub-objects; AudD's top-level album is often missing.
    album: result.album ?? spotify.album?.name ?? apple.albumName ?? null,
    releaseDate:
      result.release_date ?? spotify.album?.release_date ?? apple.releaseDate ?? null,
    albumArt: spotify.album?.images?.[0]?.url ?? appleArtwork(apple.artwork) ?? null,
    spotifyUrl: spotify.external_urls?.spotify ?? null,
    appleMusicUrl: apple.url ?? null,
    // AudD returns no confidence score at all. Null rather than absent, so the field is
    // present in every response regardless of provider and the popup never branches on
    // whether the key exists. Phase 0 found AudD can be confidently wrong, so the UI hedges
    // unconditionally instead of keying off this.
    confidence: null,
  };
}

export async function identify(buffer, filename) {
  const token = process.env.AUDD_TOKEN;
  if (!token) throw new UpstreamError('AUDD_TOKEN is not set');

  const form = new FormData();
  form.append('api_token', token);
  form.append('file', new Blob([buffer]), filename);
  form.append('return', 'apple_music,spotify');

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Covers DNS failure, connection refused, and the timeout above.
    throw new UpstreamError(`AudD request failed: ${err.message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`AudD returned HTTP ${response.status}`);
  }

  let raw;
  try {
    raw = await response.json();
  } catch {
    // AudD serves an HTML error page under some failure modes, which is not JSON.
    throw new UpstreamError('AudD returned a non-JSON body');
  }

  return normalize(raw);
}
