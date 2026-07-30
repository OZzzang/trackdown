// Offscreen document — the only context in the extension that can record audio.
//
// It has a DOM, so MediaRecorder / AudioContext / getUserMedia are all available. Chrome
// permits exactly one offscreen document at a time; the service worker creates it with
// `reasons: ['USER_MEDIA']` and tears it down when the capture is done.
//
// Phase 1B fills this in:
//   1. getUserMedia with chromeMediaSource: 'tab' + the stream ID from the worker
//   2. AudioContext passthrough IMMEDIATELY, or capturing mutes the user's video
//   3. MediaRecorder for 5s (not 8s — see docs/DECISIONS.md), assemble the Blob
//   4. stop every track, or the recording indicator sticks around
//   5. POST the Blob to the server

console.log('[TrackDown] offscreen document loaded');
