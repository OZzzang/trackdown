// Service worker — the coordinator. No DOM here.
//
// `window` does not exist in this context, so MediaRecorder, AudioContext and
// getUserMedia are all undefined. Audio capture belongs in the offscreen document;
// this file only ever brokers it. See CLAUDE.md, "The four contexts".
//
// Also: this worker sleeps after ~30s idle and is restarted on demand. Nothing may be
// held in module scope and expected to survive — durable state goes in chrome.storage.

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[TrackDown] service worker installed (${reason})`);
});

// Phase 1A smoke test: proves the popup -> worker channel is live. Phase 1B replaces
// this with the real START_CAPTURE pipeline.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[TrackDown] message:', message);

  if (message?.type === 'PING') {
    sendResponse({ type: 'PONG', at: Date.now() });
  }

  // No `return true` — every branch above answers synchronously. Phase 1B will need it
  // once a handler awaits something, and forgetting it there is the classic MV3 bug:
  // the channel closes and the caller's promise resolves as undefined.
});
