# TrackDown

Chrome extension (Manifest V3) that identifies the background song playing in a browser tab.

Flow: user clicks the icon → 5s of tab audio captured → POSTed to our Express proxy →
forwarded to AudD → normalized song metadata returned to the popup.

## Stack

- `extension/` — Vite + React (popup only), vanilla JS (service worker, offscreen doc)
- `server/` — Node + Express, deployed to Railway/Render
- MongoDB Atlas (Phase 3+)
- AudD for audio fingerprinting

## The four contexts — do not mix these up

| Directory | Context | DOM? | Notes |
|---|---|---|---|
| `extension/src/popup/` | Popup | yes | React. **Destroyed the moment it loses focus.** |
| `extension/src/background/` | Service worker | **no** | Coordinator only. Sleeps after ~30s idle. |
| `extension/src/offscreen/` | Offscreen document | yes | The only place audio can be recorded. **`chrome.runtime` is the only extensions API it has.** |

These share no memory. Commands travel by `chrome.runtime.sendMessage`; **capture state
travels through `chrome.storage.session`**, which every context reads, writes and subscribes
to. `extension/src/shared/capture-state.js` is the one definition of that state and is
imported by all three — Vite emits it as `dist/assets/capture-state.js`, a shared chunk the
module service worker imports by relative path.

`MediaRecorder`, `AudioContext`, and `getUserMedia` exist **only** in the offscreen document.
Never write them into the service worker — it has no `window`, so they are undefined there.

The restriction runs the other way too, and is easier to miss because the manifest looks like
it grants the permission. **`chrome.storage` is undefined in the offscreen document** —
`chrome.runtime` is the only extensions API offscreen documents support, regardless of what
`permissions` says. Anything that context learns and wants remembered must be sent to the
worker: `reportPhase()` in `shared/capture-state.js` is that path, and `setCaptureState()` is
worker-and-popup only. This cost a debugging session on 2026-08-08; see `docs/DECISIONS.md`.

## Hard rules

- **Manifest V3 only.** Most Chrome extension code online is V2, looks plausible, and will not work.
- Provider credentials live in `server/.env`. They must never appear anywhere under
  `extension/` — extension source is fully public once shipped.
- The popup is a stateless renderer. Durable state goes in `chrome.storage.session`
  (or `chrome.storage.local` for the install-time device UUID).
- **The fingerprinting provider is a config value, not a dependency.** `PROVIDER` selects
  `services/audd.js` or `services/acrcloud.js`. Provider-specific field names stay inside
  that one file; nothing above `services/` may know which one answered. Routes speak our
  normalized shape only. **`PROVIDER=acrcloud` since 2026-08-08** — the AudD trial ran out,
  so it is now the development provider as well as the production one. AudD remains selectable
  and its token is still in `.env`; nothing else changed to make the switch.
- Providers differ, and those differences are the normalizer's problem, not the UI's:
  ACRCloud returns no artwork and no Apple Music URL but does return a confidence score.
  Fill missing artwork server-side in `services/artwork.js`, keep `confidence` optional
  and null for AudD, and hedge result copy unconditionally rather than keying off a score
  only one provider supplies.
- "Song not found" is a *successful* request: `200 { found: false }`. Not a 404.
- Never write captured audio to disk. The privacy policy promises we don't retain it.
- Vite output must not be content-hashed — `manifest.json` references files by exact path.
- Tab audio must be routed back to the speakers via an `AudioContext` passthrough, or
  capturing mutes the user's video.

## Commands

From `extension/`:

| Command | Does |
|---|---|
| `npm run build` | Build to `extension/dist/`, then verify exact-path references |
| `npm run dev` | Same, rebuilding on change |
| `npm run verify` | Check `dist/` against the paths `manifest.json` hardcodes |

From `server/`:

| Command | Does |
|---|---|
| `npm run dev` | Start on `PORT` (default 3000), restarting on change |
| `npm start` | Same, without the watcher |

Both load `server/.env` through Node's built-in `--env-file-if-exists`, so there is no
`dotenv` dependency and a deployed host that sets env vars in its dashboard — with no `.env`
file present — still boots.

## Extension build layout

Chrome loads **`extension/dist/`** — the build output — not `extension/`. There is no hot
reload; hit the reload icon on the card at `chrome://extensions` after every rebuild.

Two placements exist to keep the dist root flat, because everything in it is addressed by
exact path:

- `public/manifest.json` — Vite copies `public/` to the dist root verbatim, so the manifest
  lands next to the files it references without pulling in a copy plugin.
- `popup.html` / `offscreen.html` live at the **extension root**, not beside their JS. Vite
  emits an HTML entry at its path relative to the project root, so putting them in
  `src/popup/` would emit `dist/src/popup/index.html` — build output that reads like source.

`npm run verify` runs after every build and fails it if anything referenced by exact path
is missing. That failure is otherwise silent: the extension still loads, the worker just
never runs.

## Current phase

**Phase 2 — ship it.** Phases 0 through 1D are complete; see `docs/DECISIONS.md`. 1C ran
before 1B deliberately; the reasoning is recorded there. Run the server with `npm run dev`
from `server/` while working on the extension — the extension has no offline path.

Phase 1D closed on 2026-08-08, verified in the browser end to end. The popup is a pure
renderer over `chrome.storage.session`: the worker is the **sole writer** of state, the
offscreen document reports the two transitions only it can time, and the popup subscribes to
`onChanged`. It owns every user-facing sentence, keyed off the `reason` each layer returns.
Silence detection is two-tier (exactly-zero at 1.2s, RMS at 5s), a muted tab is refused up
front, and `debug` vs `message` splits exception text from authored copy. All in
`docs/DECISIONS.md` under 2026-08-08.

Every row of the `docs/PLAN.md` Phase 1D table now has a passing test behind it: the happy
path on **YouTube, Instagram Reels and TikTok** (the stated milestone), paused and muted tabs,
`chrome://`, a popup dismissed mid-capture and reopened both during and after, server-down vs
offline as distinct copy, a 502, and a 429 rendering "about 60 minutes" from `retryAfter`.
Still untested from earlier phases: the Web Store and the PDF viewer.

**Cover art is filled at the seam, not by the provider.** ACRCloud returns none, so
`services/artwork.js` looks it up from the iTunes Search API on the way out — no credentials,
no account, no key. It refuses to guess: a candidate needs title **and** artist to match, so a
near-miss yields no artwork rather than a stranger's album cover. A failed lookup never fails
an identification; `{song.albumArt && …}` degrades to a text-only result exactly as before.

Confirmed in the browser 2026-08-11: most official releases resolve, a minority come back
bare. That is the matcher declining a near-miss, not a defect — accepted deliberately, since
the alternative is pairing a hedged "best match" with confidently wrong art.

Do not reach for Spotify here. Its Web API now returns `403 Active premium subscription
required for the owner of the app` for catalogue reads, and the dashboard gives no hint —
the Premium note next to "which APIs" belongs to the Web Playback SDK, so the app registers
fine and only the real call fails. Recorded in `docs/DECISIONS.md` under 2026-08-11.

**Phase 2 progress.** The global daily circuit breaker is **done** (2026-08-11):
`middleware/circuitBreaker.js` caps provider calls per UTC day across all callers, default
500, `DAILY_IDENTIFY_BUDGET` to override, `0` as a kill switch. It refuses with **503
`daily_limit`**, not 429 — the caller did nothing wrong — and counts *attempts*, so a 502
still spends budget. Verified by curl in all three states and its copy confirmed in the popup.
**Cover art is also done** (2026-08-11) — see above. Everything remaining in `PLAN.md` Phase 2
needs an account, a payment or a design decision from Owen: the deploy, store registration,
icons, and the privacy policy. Nothing is blocked on more code.

Four things 1D deliberately left for Phase 2, beyond what `PLAN.md` already lists:

- The `debug` line in the popup prints internal strings and must go before submission.
- `IDENTIFY_URL` in `offscreen/offscreen.js` **and** `host_permissions` in `public/manifest.json`
  both hardcode `http://localhost:3000` and have to move together.
- CORS is open in `server/src/index.js`; lock it to the published extension ID.
- `STALE_AFTER_MS` is 30s per phase, tuned against a local server. Re-check it against a
  deployed one, where a cold start can exceed that on its own.

`server/clip.webm` is a known-good control clip, gitignored. When a capture misbehaves, curl
it at the server to tell a bad recording apart from a bad upload in one command.

Settled in Phase 0: AudD accepts `webm/opus` untranscoded (no ffmpeg, no container host),
speech over music is not a failure mode, and the round trip is ~1s. **Capture length is 5s.**
`PLAN.md` still says 8s in its Phase 0 section — that is the historical record of what the
spike recorded, not a spec.

A standing constraint on result copy: AudD returns no confidence score, and has been observed
matching audio correctly while reporting the wrong title from a mislabeled compilation entry.
Results must not be presented to the user as certain. This holds under ACRCloud too — it
*does* return a score, and the popup still hedges unconditionally, so the copy does not shift
depending on which provider answered.
