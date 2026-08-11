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
- ~~**Cover art.**~~ **Done 2026-08-11** — filled from the iTunes Search API, no credentials
  needed. Section below records why it is not Spotify.
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

### Cover art — done 2026-08-11, via the iTunes Search API

`server/src/services/artwork.js`, hung off the `services/index.js` seam. Needs no credentials
of any kind. Full reasoning in `docs/DECISIONS.md`; the short version is that **Spotify's Web
API now refuses catalogue reads unless the app owner holds Premium** — a valid
client-credentials token still returns `403 Active premium subscription required for the owner
of the app`. That killed the original plan outright, and ACRCloud returns no Deezer ID and no
ISRC to route around it with.

If you ever revisit this, the two things worth knowing:

- Matching is deliberately **conservative**. iTunes is searched by title and artist, and a
  candidate is only accepted when *both* match after normalization. A title-only match returns
  no artwork rather than a guess, because a bare title search lands on karaoke covers and
  tribute records whose art belongs to a different release entirely. Results are already
  hedged as a "best match"; pairing one with confidently wrong art compounds the exact error
  the hedge exists to warn about.
- Comparison is substring-either-way, not equality: ACRCloud says "League of Legends" where
  iTunes says "League of Legends Music", and exact matching rejects the right answer over a
  suffix.

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
