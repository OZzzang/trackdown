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
7. Offscreen → `MediaRecorder`, 8s, assemble Blob
8. Offscreen → `stream.getTracks().forEach(t => t.stop())` or the recording indicator sticks
9. Offscreen → `fetch` the Blob to the server directly

**Known failures to handle:** `chrome://` pages, the Web Store, the PDF viewer, and tabs
with no audio playing.

**Milestone:** clicking while YouTube plays yields an 8s Blob with zero audio interruption.

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

CORS: the extension's origin is `chrome-extension://<id>`. Allow-all in dev (the ID changes
on reload), lock down before submission.

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

- `express-rate-limit` per IP (~10/hr, 50/day) **plus** a global daily circuit breaker so
  quota abuse fails closed rather than generating a bill
- Deploy server to Railway or Render. Free tiers cold-start ~50s, which reads as broken —
  the ~$7/mo tier is worth it for real users. Env vars go in the dashboard.
- Privacy policy (legally required — we record audio). Covers what's captured, that it goes
  to our server and to AudD, that audio is not retained, and what is. Host on Owen-Site.
- Store assets: 128×128 icon, 1280×800 screenshot, short + long descriptions. $5 one-time fee.
- Minimize permissions — no `<all_urls>`. Reviewers reject unjustified breadth.

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
