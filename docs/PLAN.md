# Build plan

Phases are ordered so that the riskiest unknown resolves first, and so the Chrome Web Store
review clock starts as early as possible. Each phase ends in an observable milestone —
don't move on from a broken one.

---

## Phase 0 — Verify the audio format

**Goal:** confirm AudD accepts `webm/opus`, the format Chrome's `MediaRecorder` produces.

**Why first:** this is the only unknown that can force an architecture change. If AudD rejects
the format, the server needs ffmpeg, which changes hosting, latency, and deploy complexity.
Two hours now beats losing day three.

**Tasks**
- Sign up for AudD, get an API token, note the free tier limits
- Build a throwaway `scratch/spike.html` that records 8s of mic audio and downloads a `.webm`
- `curl` the file to AudD and inspect the response

**Questions to answer and record in DECISIONS.md**
1. Is `webm/opus` accepted without transcoding?
2. What clip length reliably matches? Test 3s / 5s / 8s / 10s
3. Does it still match with **speech over the music**? This is the real use case
   (YouTube vlogs, Reels) and is much harder than clean audio. This is the true hit rate.
4. What is the round-trip latency? Determines whether the UI needs a progress state

**Milestone:** a real song correctly identified from a `.webm` clip via curl.

**Gate:** accepted → continue as planned. Rejected → add ffmpeg, switch to a container host,
and budget extra time.

---

## Phase 1A — Scaffold + build config

**Goal:** an empty but loadable extension with all three contexts wired.

```
extension/
  manifest.json
  vite.config.js
  src/
    popup/      index.html  main.jsx  App.jsx     <- React
    background/ service-worker.js                 <- vanilla
    offscreen/  offscreen.html  offscreen.js      <- vanilla
```

The build config is the likely sticking point: three entry points, and two of them are
referenced by exact filename in `manifest.json`. Vite's default content hashing breaks that
silently — override `output.entryFileNames` to `'[name].js'`.

**Milestone:** loads unpacked at `chrome://extensions`, popup renders React, service worker
logs on install.

---

## Phase 1B — Capture pipeline (hardest part)

1. Popup → `sendMessage({type:'START_CAPTURE'})`
2. SW → `chrome.tabCapture.getMediaStreamId({ targetTabId })` (returns a ticket, not a stream)
3. SW → create offscreen document (`reasons: ['USER_MEDIA']`, only one may exist)
4. SW → send ticket to offscreen
5. Offscreen → `getUserMedia` with `chromeMediaSource: 'tab'` constraints
6. Offscreen → **AudioContext passthrough immediately**, or the user's audio goes silent
7. Offscreen → `MediaRecorder`, 5s, assemble Blob
8. Offscreen → `stream.getTracks().forEach(t => t.stop())` or the recording indicator sticks
9. Offscreen → `fetch` the Blob to the server directly

**Known failures to handle:** `chrome://` pages, the Web Store, the PDF viewer, and tabs
with no audio playing.

**Milestone:** clicking while YouTube plays yields a 5s Blob with zero audio interruption.

---

## Phase 1C — Express proxy

```
server/src/
  index.js
  routes/identify.js
  services/audd.js        <- all provider-specific code lives ONLY here
  middleware/rateLimit.js
```

`POST /api/identify` — multer memory storage (2MB cap), attach token server-side, forward,
then normalize to our own contract:

```js
{ found, title, artist, album, releaseDate, albumArt, spotifyUrl, appleMusicUrl }
```

Status codes: `200 {found:false}` for no match, `429` rate limited, `502` upstream down.
Never forward the raw upstream body.

CORS: the extension's origin is `chrome-extension://<id>`. Allow-all in dev — an unpacked
extension's ID is a hash of the loaded directory's absolute path, so it is stable per machine
but differs for anyone who clones elsewhere, and differs again from the published ID. Lock
down before submission.

**Milestone:** `curl -F "file=@clip.webm" localhost:3000/api/identify` returns clean JSON.

---

## Phase 1D — Wire up + error states

Popup state machine: `idle → recording → identifying → result | no-match | error`.

| Situation | User sees |
|---|---|
| No audio playing | "Start the video first" |
| `chrome://` page | "Can't listen on this page" |
| Offline | Distinguished from server-down |
| Server 502 | "Service unavailable — try again" |
| No match | Explain: live covers and remixes often aren't in the database |
| Rate limited | When they can retry |
| Popup closed mid-request | Completes anyway; result waiting on reopen |

**Milestone:** works on YouTube, Instagram Reels, **and** TikTok. Reels autoplay muted —
a real edge case.

---

## Phase 2 — Ship it

Roughly in this order. The circuit breaker is first because it is the only item whose
downside compounds while you work on the others.

- **Global daily circuit breaker.** `express-rate-limit` already caps per IP (10/hr, 50/day),
  which bounds one attacker, not total spend. `PROVIDER=acrcloud` bills per call, so a public
  extension pointing at an open proxy is an unbounded bill. Must fail closed.
- **Cover art from the Spotify Web API.** Own section below — it needs a credential you have
  to go and create, so start it early even though it is not the biggest job.
- Deploy server to Railway or Render. Free tiers cold-start ~50s, which reads as broken —
  the ~$7/mo tier is worth it for real users. Env vars go in the dashboard.
- **Move `IDENTIFY_URL` and `host_permissions` together.** `extension/src/offscreen/offscreen.js`
  and `extension/public/manifest.json` both hardcode `http://localhost:3000`. A fetch to a host
  not in `host_permissions` is blocked before it leaves and reads as the server being down.
- **Re-check `STALE_AFTER_MS`** (30s per phase, in `extension/src/shared/capture-state.js`). It
  was tuned against a local server; a deployed cold start can exceed it alone and would surface
  as a spurious "That took too long".
- **Delete the `debug` line** in `extension/src/popup/App.jsx`. It prints raw exception text and
  must not ship. Tagged in the source.
- **Lock CORS** in `server/src/index.js` to the published extension ID, which is fixed once
  published. TODO already in place.
- **Icons.** `manifest.json` currently declares none at all — no `icons` key, no
  `action.default_icon`. Chrome is rendering a generated placeholder.
- Privacy policy (legally required — we record audio). Covers what's captured, that it goes
  to our server and to the fingerprinting provider, that audio is not retained, and what is.
  Host on Owen-Site. Say **ACRCloud**, not AudD — the provider changed on 2026-08-08.
- Store assets: 128×128 icon, 1280×800 screenshot, short + long descriptions. $5 one-time fee.
  Take the screenshot *after* cover art works; a text-only result undersells it.
- Minimize permissions — no `<all_urls>`. Reviewers reject unjustified breadth.
- Untested surfaces still outstanding from Phase 1: the Chrome Web Store page and the built-in
  PDF viewer. Both should hit `unsupported_page`; neither has been confirmed.

### Cover art — Spotify Web API (planned 2026-08-08, not yet built)

ACRCloud returns no artwork and no Apple Music URL, but does return a Spotify track ID, so the
art is one lookup away. Decision and rejected alternative are in `docs/DECISIONS.md`.

**Blocking human input:** create an app at https://developer.spotify.com/dashboard, then put
its client ID and secret in `server/.env` as `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.
`.env.example` already documents both; `server/.env` currently has neither. This is the
client-credentials grant — no user login, no redirect URI, unrelated to the user-facing
Spotify OAuth in Phase 4.

Shape of the work, so it does not need re-deriving:

- New `server/src/services/artwork.js`, called from the `services/index.js` seam — **not** from
  `acrcloud.js`. Artwork filling is provider-agnostic by CLAUDE.md's rule, and hooking it at the
  seam means any future provider that omits art is covered for free.
- Applies only when a result is `found`, `albumArt` is null, and a Spotify ID can be parsed out
  of `spotifyUrl`. Parse it from the URL rather than adding `spotifyId` to the contract; the
  normalized shape stays as documented above.
- Client-credentials token: `POST https://accounts.spotify.com/api/token` with HTTP Basic auth,
  cached in memory against `expires_in` (3600s) with a refresh margin, and a single shared
  in-flight refresh so concurrent requests do not each fetch one — same pattern as
  `ensureOffscreenDocument`'s `creating` guard.
- Then `GET https://api.spotify.com/v1/tracks/{id}` → `album.images`, which come back at
  640/300/64. Pick the **smallest that clears 300px**: the popup renders art at 56px CSS, so 300
  covers a 3x display and 640 is wasted bytes.
- Cache artwork URLs by track ID, capped and evicting oldest. Cache a definitive "no art"
  (a 200 with no images, or a 404) so it is not retried; do **not** cache a transient failure.
- On 401, drop the cached token and retry once — tokens can be revoked mid-life.
- **A failed artwork lookup must never fail the identify.** Log it, return `albumArt: null`, and
  let the popup render exactly as it does today. `{song.albumArt && …}` already degrades.
- With no credentials configured, skip silently and warn once at startup rather than per
  request. Consider reporting configured-or-not from `/health` alongside `provider`, which is
  the same diagnostic role it already plays.

**Submit here, before Phases 3–4.** Review takes days to weeks and is the one thing that
can't be sped up. Updates can ship while it's pending.

---

## Phase 3 — History

Identity without login: generate a UUID on install, store in `chrome.storage.local`, send as
a header.

```js
{ deviceId, title, artist, album, albumArt, spotifyUrl,
  identifiedAt, sourceUrl, sourceTitle }
```

Storing `sourceUrl` / `sourceTitle` — the video it was found on — is the differentiator.
Shazam gives you a song; this gives you the song, the video, and the date.

Routes: `GET /api/history` (paginated), `DELETE /api/history/:id`, `DELETE /api/history`
(clear-all, needed to honor the privacy policy).

Compound index `{ deviceId: 1, identifiedAt: -1 }` matching the access pattern.

---

## Phase 4 — Spotify OAuth

- `chrome.identity.launchWebAuthFlow`, redirect URI `https://<ext-id>.chromiumapp.org/`
- **Authorization Code + PKCE** — extensions cannot hold a client secret
- Scopes: `playlist-modify-private playlist-modify-public`
- Access tokens expire hourly; needs refresh handling

**Check before committing to this:** Spotify apps start in development mode, capped at 25
manually-allowlisted users until a quota extension is granted. Great interview demo, not a
public feature on day one.

Playlist-add works on Spotify Free. Playback control needs Premium — don't build playback.
