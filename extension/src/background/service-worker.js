// Service worker — the coordinator. No DOM here.
//
// `window` does not exist in this context, so MediaRecorder, AudioContext and
// getUserMedia are all undefined. Audio capture belongs in the offscreen document;
// this file only ever brokers it. See CLAUDE.md, "The four contexts".
//
// Also: this worker sleeps after ~30s idle and is restarted on demand. Nothing may be
// held in module scope and expected to survive — durable state goes in chrome.storage.

import { PHASE_MESSAGE, setCaptureState } from '../shared/capture-state.js';

const OFFSCREEN_DOCUMENT = 'offscreen.html';

// Surfaces Chrome will not capture. getMediaStreamId does throw on these, but with a
// message that never says which rule was hit, so check first and fail with a reason
// Phase 1D can turn into copy.
const BLOCKED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'devtools:',
  'view-source:',
];

// Returns a reason string if this tab can't be captured, or null if it can.
function blockedReason(url) {
  // activeTab is granted by the click that opened the popup. If url is still missing,
  // the grant didn't land and nothing downstream will work either.
  if (!url) return 'Chrome did not grant access to this tab.';

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "This tab has no page to listen to.";
  }

  if (BLOCKED_SCHEMES.includes(parsed.protocol)) {
    return `Can't listen on ${parsed.protocol}// pages.`;
  }

  // The Web Store is special-cased by Chrome itself — extensions are blocked from it so
  // that none can interfere with installing or removing another.
  const onWebStore =
    parsed.hostname === 'chromewebstore.google.com' ||
    (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore'));
  if (onWebStore) return "Can't listen on the Chrome Web Store.";

  return null;
}

// Chrome permits exactly one offscreen document per extension and createDocument() throws
// if one already exists. Two fast clicks would race, so in-flight creation is shared.
// Module scope is safe for this and only this: it never has to outlive a single wake.
let creating = null;

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT)],
  });
  if (existing.length > 0) return;

  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT,
      reasons: ['USER_MEDIA'],
      justification: 'Record a few seconds of tab audio to identify the song playing in it.',
    });
  }

  try {
    await creating;
  } finally {
    creating = null;
  }
}

async function startCapture() {
  // `tabs` is deliberately not in the manifest. query() still returns the tab, and
  // activeTab — granted by the popup click — is what fills in `url`.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { ok: false, reason: 'no_tab', message: 'No active tab.' };
  console.log('[TrackDown] 1/4 tab:', tab.id, tab.url);

  const blocked = blockedReason(tab.url);
  if (blocked) return { ok: false, reason: 'unsupported_page', message: blocked };

  // A muted tab captures as digital silence, so this is only a shortcut — the offscreen
  // document would reach the same verdict five seconds later. It is worth taking because
  // the fix is one click and naming it beats "nothing playing", which sounds like the
  // video's fault. `mutedInfo` needs no permission; only url/title are gated by `tabs`.
  //
  // Note the asymmetry with `tab.audible`, which is NOT used: false there means "no sound
  // right now", which a quiet intro or a gap between tracks also satisfies. Muted is a
  // state, audible is an instant, and only the state is safe to refuse on.
  if (tab.mutedInfo?.muted) return { ok: false, reason: 'tab_muted' };

  // A ticket, not a stream. It can only be redeemed by this extension, and only while the
  // activeTab grant from the click that opened the popup is still live.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  console.log('[TrackDown] 2/4 stream id acquired');

  await ensureOffscreenDocument();
  console.log('[TrackDown] 3/4 offscreen document ready');

  try {
    const reply = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'CAPTURE_TAB',
      streamId,
    });
    console.log('[TrackDown] 4/4 offscreen replied:', reply);
    // An offscreen document that closed its channel without answering resolves this as
    // undefined, and an undefined outcome renders as nothing at all — the same silent
    // failure the popup used to have. Name it here so it can never reach storage.
    return (
      reply ?? {
        ok: false,
        reason: 'capture_failed',
        debug: 'The offscreen document closed the channel without answering.',
      }
    );
  } finally {
    // Free the single offscreen slot and drop the recording indicator no matter how the
    // capture ended. Leaving it open would block the next click.
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[TrackDown] service worker installed (${reason})`);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // The offscreen document listens on this same channel. Anything addressed elsewhere is
  // not ours to answer.
  if (message?.target && message.target !== 'service-worker') return;

  // The offscreen document sees two transitions nobody else can time — the instant the
  // recorder starts, and the instant the upload begins — and cannot write either one down,
  // because chrome.storage does not exist there. This worker is the only writer of capture
  // state; the offscreen document just tells it what happened.
  //
  // The write is completed BEFORE answering. The sender awaits that answer, so finishing
  // first is what keeps a phase from landing after the `done` that follows it.
  if (message?.type === PHASE_MESSAGE) {
    setCaptureState({ status: message.status }).then(() => sendResponse(true));
    return true;
  }

  if (message?.type !== 'START_CAPTURE') return;
  console.log('[TrackDown] 0/4 START_CAPTURE received');

  // Every path below ends in a `done` write, and the popup renders from those writes rather
  // than from sendResponse. 5s of capture plus a round trip outlives the popup whenever the
  // user looks away, and a closed popup means sendResponse lands nowhere; storage is the
  // one channel that survives it. The response is kept because the popup uses its rejection
  // — not its value — to notice a worker that never woke.
  const finish = async (outcome) => {
    await setCaptureState({ status: 'done', outcome });
    sendResponse(outcome);
  };

  setCaptureState({ status: 'starting' })
    .then(startCapture)
    .then(finish)
    .catch((err) => {
      console.error('[TrackDown] capture failed:', err);
      return finish({ ok: false, reason: 'internal', debug: err.message });
    });

  // Required: the handler above is async. Without it the channel closes immediately and
  // the popup's promise resolves as undefined — the classic MV3 bug.
  return true;
});
