# TrackDown

Identify the background song in any browser tab — YouTube, Instagram Reels, TikTok — from a
single click.

> 🚧 In development. See [`docs/PLAN.md`](docs/PLAN.md) for the build plan.

## How it works

Chrome extension captures 5 seconds of tab audio, sends it to a Node/Express proxy, which
forwards it to an audio-fingerprinting service and returns the match. The proxy exists so the
API key never ships inside publicly-readable extension code.

## Stack

Chrome Extension (Manifest V3) · React · Vite · Node · Express · MongoDB

## Local setup

```bash
cd extension
npm install
npm run build
```

Then load it into Chrome:

1. Go to `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select `extension/dist` (the build output, not `extension/` itself)

`npm run dev` rebuilds on save. Chrome does not hot-reload extensions, so click the reload
icon on the TrackDown card after each rebuild.

Server setup: _TBD — added at Phase 1C._

## Structure

```
extension/   Chrome extension (popup, service worker, offscreen document)
server/      Express API — proxies audio to the recognition service
docs/        Build plan and decision log
scratch/     Planning and testing APIs before building out core features
```

## License

[MIT](LICENSE) — you'll need your own AudD API token to run it.
