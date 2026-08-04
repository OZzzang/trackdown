// TrackDown API server.
//
// Exists for one reason: to hold the provider credential. Extension source is fully public
// once shipped, so the token cannot live there. Everything else here follows from that.

import express from 'express';
import identifyRoute from './routes/identify.js';
import { providerName, selectProvider } from './services/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Railway/Render the client IP arrives in X-Forwarded-For, and without this the rate
// limiter sees the proxy's IP and limits every user as one. Off by default because trusting
// the header when NOT behind a proxy lets anyone forge an IP and bypass the limiter
// entirely. Set TRUST_PROXY=1 in the host's dashboard at deploy time, not before.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

// CORS. The extension's origin is chrome-extension://<id>. For an unpacked extension Chrome
// derives that ID by hashing the absolute path of the loaded directory — so it is stable
// across reloads on one machine, but differs for anyone who clones this repo somewhere else,
// and differs again from the Web Store ID after publishing. Allowing all in dev avoids
// baking one developer's ID into the server.
//
// Note this is belt-and-braces rather than load-bearing: an extension page fetching a host
// listed in its own `host_permissions` is not subject to CORS in the first place. These
// headers matter for curl and for any non-extension caller.
//
// TODO(Phase 2): lock this to the published extension ID before store submission. That ID
// is fixed once published, so there is no reason to keep this open.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Cheap liveness check for the host's health probe. Reports which provider is configured,
// which is the single most useful thing to know when a deploy misbehaves — and is not
// sensitive: it names the adapter, never the credential.
app.get('/health', (_req, res) => {
  res.json({ ok: true, provider: providerName() });
});

app.use('/api', identifyRoute);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'No such endpoint.' });
});

// Anything that reached here is our bug, not the caller's. Log it in full, tell the client
// nothing — stack traces and provider messages are exactly what must not leak.
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
});

// Fail loudly at boot on a bad PROVIDER rather than on the first request. A server that
// starts clean and 500s on every identify is worse than one that refuses to start.
try {
  selectProvider();
} catch (err) {
  console.error(`[boot] ${err.message}`);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`TrackDown API on http://localhost:${PORT} — provider: ${providerName()}`);
});
