// Provider selection — the seam that keeps the provider a config value.
//
// This is the only file above the adapters that names them, and it exports one function
// with one shape. Routes call `identify()` and cannot tell who answered.

import * as audd from './audd.js';
import * as acrcloud from './acrcloud.js';

// `acr` is an alias, not a second name. scratch/batch.sh and the pre-launch checklist in
// docs/DECISIONS.md both use `PROVIDER=acr`, while .env.example and CLAUDE.md say
// `acrcloud`. Accepting both means the checklist — which runs days before the production
// switch — cannot fail on a spelling difference at exactly the wrong moment.
const PROVIDERS = {
  audd,
  acrcloud,
  acr: acrcloud,
};

const DEFAULT_PROVIDER = 'audd';

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
export async function identify(buffer, filename) {
  return selectProvider().identify(buffer, filename);
}

export function providerName() {
  return selectProvider().name;
}
