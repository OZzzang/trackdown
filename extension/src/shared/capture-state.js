// The capture state machine — and the only place its shape is written down.
//
// All three contexts touch it. The worker opens and closes a capture; the offscreen
// document reports the two transitions only it can see; the popup renders whatever is
// there. They share no memory, so chrome.storage.session is both the store and the
// transport: a write fires storage.onChanged in every context currently alive, and a popup
// that was shut the whole time reads the same key on mount and cannot tell the difference.
//
// That is the whole answer to "popup closed mid-request". There is no reconnect path and no
// message to miss, because the popup was never the thing holding the state.

export const STATE_KEY = 'captureState';

// How long we record. Lives here rather than in the offscreen document because the popup's
// progress bar has to run for exactly as long as the recorder does — two constants that
// must agree is one constant.
export const RECORD_MS = 5000;

// A capture that reaches no terminal state within this window is presumed dead. The worker
// can be killed mid-flight — a crashed offscreen document, a closed tab, an MV3 shutdown
// that beats our own timers — and none of those write `done`. Without this the popup sits
// at "Listening…" forever, which is the one failure mode that looks like our bug even when
// it isn't. Measured from the last transition, not from the start, so each phase gets its
// own budget — generous against 5s of recording and a ~1s round trip.
export const STALE_AFTER_MS = 30_000;

// Message type the offscreen document uses to report a transition it cannot write itself.
export const PHASE_MESSAGE = 'CAPTURE_PHASE';

/**
 * Statuses, in order:
 *   starting     — worker is resolving the tab and spinning up the offscreen document
 *   recording    — the recorder is actually running; `at` is when it started
 *   identifying  — audio captured, waiting on the server
 *   done         — terminal; carries `outcome`
 *
 * WORKER AND POPUP ONLY. `chrome.storage` does not exist in an offscreen document — the
 * runtime API is the only extensions API offscreen documents support — so calling this
 * there throws a TypeError on `chrome.storage.session`. Use `reportPhase` instead.
 */
export async function setCaptureState(state) {
  // `at` is stamped here, always, so no caller can forget it and no two callers can
  // disagree about what it means: the moment this status began.
  await chrome.storage.session.set({ [STATE_KEY]: { ...state, at: Date.now() } });
}

export async function getCaptureState() {
  const stored = await chrome.storage.session.get(STATE_KEY);
  return stored[STATE_KEY] ?? null;
}

// True once a non-terminal state has sat unchanged long enough to be presumed dead.
export function isStale(state) {
  return !!state && state.status !== 'done' && Date.now() - state.at > STALE_AFTER_MS;
}

/**
 * OFFSCREEN DOCUMENT ONLY. Asks the worker to record a transition.
 *
 * The offscreen document is the only context that knows when recording actually began and
 * when the upload actually started, and it is the only context that cannot write either
 * fact down: chrome.runtime is the only extensions API available to it. So it asks.
 *
 * Awaited by callers that have work queued behind the transition, and it has to be: the
 * worker writes `done` as soon as this document answers the capture message, so a phase
 * report still in flight at that moment would land *after* the terminal state and strand
 * the popup on "Identifying…" until the staleness timer fired. The worker completes its
 * write before responding, so awaiting here is what orders the two.
 */
export function reportPhase(status) {
  return chrome.runtime
    .sendMessage({ target: 'service-worker', type: PHASE_MESSAGE, status })
    .catch(() => {}); // a phase is cosmetic; never fail a capture over one
}
