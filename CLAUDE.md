# TrackDown

Chrome extension (Manifest V3) that identifies the background song playing in a browser tab.

Flow: user clicks the icon → 8s of tab audio captured → POSTed to our Express proxy →
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
| `extension/src/offscreen/` | Offscreen document | yes | The only place audio can be recorded. |

These share no memory. They communicate only via `chrome.runtime.sendMessage`.

`MediaRecorder`, `AudioContext`, and `getUserMedia` exist **only** in the offscreen document.
Never write them into the service worker — it has no `window`, so they are undefined there.

## Hard rules

- **Manifest V3 only.** Most Chrome extension code online is V2, looks plausible, and will not work.
- Provider credentials live in `server/.env`. They must never appear anywhere under
  `extension/` — extension source is fully public once shipped.
- The popup is a stateless renderer. Durable state goes in `chrome.storage.session`
  (or `chrome.storage.local` for the install-time device UUID).
- **The fingerprinting provider is a config value, not a dependency.** `PROVIDER` selects
  `services/audd.js` (development) or `services/acrcloud.js` (production). Provider-specific
  field names stay inside that one file; nothing above `services/` may know which one
  answered. Routes speak our normalized shape only.
- Providers differ, and those differences are the normalizer's problem, not the UI's:
  ACRCloud returns no artwork and no Apple Music URL but does return a confidence score.
  Fill missing artwork server-side from the Spotify track ID, keep `confidence` optional
  and null for AudD, and hedge result copy unconditionally rather than keying off a score
  only one provider supplies.
- "Song not found" is a *successful* request: `200 { found: false }`. Not a 404.
- Never write captured audio to disk. The privacy policy promises we don't retain it.
- Vite output must not be content-hashed — `manifest.json` references files by exact path.
- Tab audio must be routed back to the speakers via an `AudioContext` passthrough, or
  capturing mutes the user's video.

## Commands

_TBD — filled in at Phase 1A._

## Current phase

**Phase 1A** — scaffold and build config. Phase 0 is complete; see `docs/DECISIONS.md`.

Settled in Phase 0: AudD accepts `webm/opus` untranscoded (no ffmpeg, no container host),
speech over music is not a failure mode, and the round trip is ~1s. **Capture length is 5s,
not the 8s written throughout `PLAN.md`.**

One finding constrains Phase 1D: AudD returns no confidence score, and has been observed
matching audio correctly while reporting the wrong title from a mislabeled compilation
entry. Results must not be presented to the user as certain.
