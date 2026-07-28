# Phase 0 spike rigs

Throwaway-quality code, kept deliberately: these produced every measurement in
[`docs/DECISIONS.md`](../docs/DECISIONS.md), so the reasoning there is reproducible rather
than just asserted. Not part of the extension or the server, and not built or linted.

Audio output is gitignored — clips stay local.

| File | What it does |
|---|---|
| `spike.html` | Records a clip from a tab or the mic, downloads `.webm`. Open directly in Chrome. |
| `mix.html` | Blends a music clip with a speech clip at controlled gains and records the result. Shows an RMS level per input so a dead mic is obvious. |
| `identify.sh` | Uploads a clip to AudD. Bearer token. |
| `identify-acr.sh` | Same, to ACRCloud. HMAC-SHA1 request signing. |
| `parse.js` | Normalizes an AudD response to our contract. Draft of `server/src/services/audd.js`. |
| `parse-acr.js` | Same for ACRCloud, to the identical contract. |
| `batch.sh` | Runs a folder of clips through either provider and tabulates results. |

## Setup

Credentials come from `server/.env` (see `.env.example`), which is never committed — so on
a new machine, copy the template and paste your tokens in:

```bash
cp .env.example server/.env
```

Then, once per terminal session:

```bash
set -a; source server/.env; set +a
```

## Use

```bash
# one clip
./scratch/identify.sh ~/Downloads/clip.webm | node scratch/parse.js

# a folder, against either provider
./scratch/batch.sh          ~/Downloads/known/*.webm
PROVIDER=acr ./scratch/batch.sh ~/Downloads/known/*.webm
```

`spike.html` and `mix.html` open straight from disk — no server needed:

```bash
open -a "Google Chrome" scratch/spike.html   # macOS
start chrome scratch\spike.html              # Windows
```

## On Windows

The two `.html` rigs are pure browser code and work anywhere Chrome does. The shell scripts
need **Git Bash** (ships with Git for Windows) or **WSL** — they will not run in PowerShell
or `cmd`. You also need `node` and `jq` (`winget install jqlang.jq`).

Scripts are written to POSIX rather than BSD syntax so they behave the same on macOS,
Linux and Git Bash, and `.gitattributes` pins them to LF endings so a Windows checkout
doesn't break bash with CRLF.

## Method notes

Worth knowing if you re-run any of this:

- **Test with tab capture, not the microphone.** A mic re-records audio through speakers and
  a room, which is not the signal the extension will ever see. The mic mode exists only to
  record a speech layer for `mix.html`.
- **Ground truth matters.** A `no match` on an unknown track is ambiguous — it could be the
  audio or a gap in the catalogue. Use songs you can name, or content that displays the
  track (TikTok shows the sound name).
- **Control your variables.** Real vlogs vary on three axes at once — is the track indexed,
  how loud is the music, how much noise sits on top. `mix.html` exists so only one moves.
- **Listen before spending an API call.** Both rigs give inline playback for this reason.
