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
- The AudD token lives in `server/.env`. It must never appear anywhere under `extension/` —
  extension source is fully public once shipped.
- The popup is a stateless renderer. Durable state goes in `chrome.storage.session`
  (or `chrome.storage.local` for the install-time device UUID).
- Provider-specific code stays inside `server/src/services/audd.js`. Routes speak our own
  normalized shape, never AudD's raw response.
- "Song not found" is a *successful* request: `200 { found: false }`. Not a 404.
- Never write captured audio to disk. The privacy policy promises we don't retain it.
- Vite output must not be content-hashed — `manifest.json` references files by exact path.
- Tab audio must be routed back to the speakers via an `AudioContext` passthrough, or
  capturing mutes the user's video.

## Commands

_TBD — filled in at Phase 1A._

## Current phase

**Phase 0** — verifying AudD accepts `webm/opus`. See `docs/PLAN.md`.

Everything below Phase 0 is provisional until that resolves: if AudD rejects the format,
the server needs an ffmpeg transcode step and a container-based host.
