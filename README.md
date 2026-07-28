# TrackDown

Identify the background song in any browser tab — YouTube, Instagram Reels, TikTok — from a
single click.

> 🚧 In development. See [`docs/PLAN.md`](docs/PLAN.md) for the build plan.

## How it works

Chrome extension captures 8 seconds of tab audio, sends it to a Node/Express proxy, which
forwards it to an audio-fingerprinting service and returns the match. The proxy exists so the
API key never ships inside publicly-readable extension code.

## Stack

Chrome Extension (Manifest V3) · React · Vite · Node · Express · MongoDB

## Local setup

_TBD — added at Phase 1A._

## Structure

```
extension/   Chrome extension (popup, service worker, offscreen document)
server/      Express API — proxies audio to the recognition service
docs/        Build plan and decision log
scratch/     Planning and testing APIs before building out core features
```

## License

[MIT](LICENSE) — you'll need your own AudD API token to run it.
