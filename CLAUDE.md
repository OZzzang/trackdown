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

**Phase 1D** — wiring up and error states. Phases 0, 1A, 1C and 1B are complete; see
`docs/DECISIONS.md`. 1C ran before 1B deliberately; the reasoning is recorded there.

The pipeline works end to end: a click captures 5s of tab audio, POSTs it, and renders the
normalized result, with the tab's audio audible throughout. Run the server with `npm run dev`
from `server/` while working on the extension — the extension has no offline path.

What 1B verified on live audio: a hit, a miss (`200 {found:false}`), a hit with wrong
metadata, and the refusal path on `chrome://` pages. What it did not: the Web Store, the PDF
viewer, and a tab with nothing playing. A silent tab currently returns whatever AudD makes of
silence rather than being detected as silent — that detection, and all user-facing error
copy, is 1D's job.

`server/clip.webm` is a known-good control clip, gitignored. When a capture misbehaves, curl
it at the server to tell a bad recording apart from a bad upload in one command.

Settled in Phase 0: AudD accepts `webm/opus` untranscoded (no ffmpeg, no container host),
speech over music is not a failure mode, and the round trip is ~1s. **Capture length is 5s.**
`PLAN.md` still says 8s in its Phase 0 section — that is the historical record of what the
spike recorded, not a spec.

One finding constrains Phase 1D: AudD returns no confidence score, and has been observed
matching audio correctly while reporting the wrong title from a mislabeled compilation
entry. Results must not be presented to the user as certain.
