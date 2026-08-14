// Provider selection — the seam that keeps the provider a config value.
//
// This is the only file above the adapters that names them, and it exports one function
// with one shape. Routes call `identify()` and cannot tell who answered.

import * as audd from './audd.js';
import * as acrcloud from './acrcloud.js';
import { withArtwork } from './artwork.js';

// `acr` is an alias, not a second name. scratch/batch.sh and the pre-launch checklist in
// docs/DECISIONS.md both use `PROVIDER=acr`, while .env.example and CLAUDE.md say
// `acrcloud`. Accepting both means the checklist — which runs days before the production
// switch — cannot fail on a spelling difference at exactly the wrong moment.
const PROVIDERS = {
  audd,
  acrcloud,
  acr: acrcloud,
};

// Was `audd` until 2026-08-14. The trial expired on 2026-08-08, so the old default meant an
// unset PROVIDER booted cleanly into a provider that could no longer answer — a 502 on the
// first identification, from a server that reported itself healthy. Defaulting to the one
// that actually works makes the failure mode a missing credential, which says so at boot.
const DEFAULT_PROVIDER = 'acrcloud';

export function selectProvider() {
  const configured = (process.env.PROVIDER ?? DEFAULT_PROVIDER).toLowerCase();
  const provider = PROVIDERS[configured];

  if (!provider) {
    const valid = Object.keys(PROVIDERS).join(', ');
    throw new Error(`PROVIDER="${configured}" is not recognized. Expected one of: ${valid}`);
  }

  return provider;
}

// Resolved per call rather than at import time, so a bad PROVIDER surfaces as a real error
// on a real request instead of a crash during module loading, and so tests can swap it.
//
// Artwork is filled here rather than in an adapter. Providers differ in what they omit, and
// patching that up is the normalizer's job — this is the seam, so a provider that returns no
// cover art is repaired without any adapter knowing it happened. A provider that does return
// art passes through untouched.
export async function identify(buffer, filename) {
  const result = await selectProvider().identify(buffer, filename);
  return withArtwork(result);
}

export function providerName() {
  return selectProvider().name;
}
