import { useCallback, useEffect, useState } from 'react';
import {
  RECORD_MS,
  STALE_AFTER_MS,
  STATE_KEY,
  getCaptureState,
  isStale,
} from '../shared/capture-state.js';

// The popup is a stateless renderer, and this file is where that stops being a slogan.
// It owns no capture state: it reads chrome.storage.session on mount, subscribes to changes
// on the same key, and renders. A capture that finishes while the popup is shut is not a
// case to handle — it is the same code path arriving through a different door.
//
// It does own all user-facing copy. Everything underneath returns a machine-readable
// `reason` and, where the wording genuinely varies with something only that layer knows,
// a `message` to slot in as detail. Two layers writing sentences is how copy drifts.

// Keyed by `reason`. A detail may be a function when it has to fold in data that came up
// with the outcome — a retry delay, a page-specific sentence.
const ERROR_COPY = {
  no_audio: {
    title: "This tab isn't playing anything",
    detail: 'Start the video, or unmute it, and try again.',
  },
  tab_muted: {
    title: 'This tab is muted',
    detail: "Unmute it with the speaker icon on the tab, then try again.",
  },
  unsupported_page: {
    // The only reason whose detail comes from below: the worker knows which rule was hit —
    // a chrome:// scheme, the Web Store, a tab with no page — and the popup does not.
    title: "Can't listen to this page",
    detail: (outcome) => outcome.message,
  },
  offline: {
    title: "You're offline",
    detail: 'Reconnect and try again.',
  },
  server_unreachable: {
    title: "Can't reach TrackDown",
    detail: 'The service is not responding. Try again in a moment.',
  },
  upstream_unavailable: {
    title: 'Identification is unavailable',
    detail: 'The music service is not answering right now. Try again shortly.',
  },
  rate_limited: {
    title: 'Too many searches',
    detail: (outcome) => retryPhrase(outcome.retryAfter),
  },
  timed_out: {
    title: 'That took too long',
    detail: 'The capture never finished. Try again.',
  },
  capture_failed: {
    title: "Couldn't record this tab",
    detail: 'The tab may have closed or navigated away. Try again.',
  },
  no_worker: {
    title: 'TrackDown is not running',
    detail: 'Reload it at chrome://extensions, then try again.',
  },
};

const FALLBACK_COPY = {
  title: 'Something went wrong',
  detail: 'Try again. If it keeps happening, reload TrackDown at chrome://extensions.',
};

// The server sends seconds, and only on 429 — the Retry-After header it reads that from is
// not guaranteed to be there, so null has to say something useful too.
function retryPhrase(seconds) {
  if (!seconds) return 'You have hit the limit for now. Try again later.';
  if (seconds < 90) return `Try again in ${seconds} seconds.`;
  return `Try again in about ${Math.ceil(seconds / 60)} minutes.`;
}

// A state read at mount may be older than the worker that wrote it. Resolving that here
// rather than on a timer keeps "Listening…" from flashing before the timeout catches it.
function hydrate(stored) {
  if (!stored) return null;
  if (!isStale(stored)) return stored;
  return { status: 'done', at: Date.now(), outcome: { ok: false, reason: 'timed_out' } };
}

export default function App() {
  const [state, setState] = useState(null);

  useEffect(() => {
    // Functional, because this read is async and the user can click — or the worker can
    // write — before it lands. Whatever is already here is by definition newer than what
    // storage looked like when we asked.
    getCaptureState().then((stored) => setState((current) => current ?? hydrate(stored)));

    // Storage is the transport as well as the store — this is how a capture already in
    // flight when the popup opened keeps reporting into it.
    const onChanged = (changes) => {
      if (STATE_KEY in changes) setState(changes[STATE_KEY].newValue ?? null);
    };
    chrome.storage.session.onChanged.addListener(onChanged);
    return () => chrome.storage.session.onChanged.removeListener(onChanged);
  }, []);

  const pending = state !== null && state.status !== 'done';

  // Nothing guarantees a `done` write. The worker can be torn down mid-capture, and the
  // popup would otherwise wait on a message that is never coming.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setState({ status: 'done', at: Date.now(), outcome: { ok: false, reason: 'timed_out' } });
    }, Math.max(state.at + STALE_AFTER_MS - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [pending, state]);

  const identify = useCallback(async () => {
    // Optimistic, so the previous result clears on click rather than one round trip later.
    setState({ status: 'starting', at: Date.now() });
    try {
      // The reply is deliberately discarded: the worker has already written the outcome to
      // storage, and the listener above has already rendered it. What is worth catching is
      // the rejection — no receiving end means the worker failed to start at all, which is
      // worth saying now instead of after a 30-second timeout.
      await chrome.runtime.sendMessage({ type: 'START_CAPTURE' });
    } catch (err) {
      setState({
        status: 'done',
        at: Date.now(),
        outcome: { ok: false, reason: 'no_worker', debug: err.message },
      });
    }
  }, []);

  return (
    <main className="popup">
      <h1>TrackDown</h1>
      <p className="tagline">Identify the song playing in this tab.</p>

      <button onClick={identify} disabled={pending}>
        {buttonLabel(state)}
      </button>

      <Status state={state} />

      <p className="phase">Phase 1D — wiring and error states.</p>
    </main>
  );
}

function buttonLabel(state) {
  if (state?.status === 'identifying') return 'Identifying…';
  if (state?.status === 'starting' || state?.status === 'recording') return 'Listening…';
  return 'Identify song';
}

function Status({ state }) {
  if (!state) return null;

  switch (state.status) {
    case 'starting':
      return <p className="status">Getting ready…</p>;
    case 'recording':
      return <Recording startedAt={state.at} />;
    case 'identifying':
      return <p className="status">Identifying…</p>;
    case 'done':
      return <Outcome outcome={state.outcome} />;
    default:
      return null;
  }
}

// The bar is a CSS animation rather than a React timer, so that a popup opened halfway
// through a capture can join it in progress: a negative delay starts the animation at the
// elapsed offset instead of from zero.
function Recording({ startedAt }) {
  const elapsed = Math.min(Math.max(Date.now() - startedAt, 0), RECORD_MS);

  return (
    <>
      <p className="status">Listening to this tab…</p>
      <div className="bar">
        <div
          className="bar-fill"
          style={{ animationDuration: `${RECORD_MS}ms`, animationDelay: `-${elapsed}ms` }}
        />
      </div>
    </>
  );
}

function Outcome({ outcome }) {
  if (!outcome) return null;
  if (outcome.ok === false) return <Problem outcome={outcome} />;

  const song = outcome.result;
  if (!song?.found) {
    return (
      <div className="notice">
        <strong className="notice-title">No match</strong>
        <span className="notice-detail">
          Live versions, covers and remixes often aren&apos;t in the database.
        </span>
      </div>
    );
  }

  return (
    <div className="result">
      {song.albumArt && <img className="art" src={song.albumArt} alt="" />}
      <div className="meta">
        {/* Hedged unconditionally. AudD returns no confidence score and has been seen
            matching audio correctly while reporting a mislabeled title — so nothing here
            may be presented as certain. See docs/DECISIONS.md. */}
        <span className="hedge">Best match</span>
        <strong className="title">{song.title}</strong>
        <span className="artist">{song.artist}</span>
      </div>
    </div>
  );
}

function Problem({ outcome }) {
  const copy = ERROR_COPY[outcome.reason];
  const { title, detail } = copy ?? FALLBACK_COPY;

  // Two different things arrive under two different names, and conflating them is what made
  // this hard to get right. `debug` is raw exception text — never written for a reader, and
  // the only record of it once the offscreen console dies, so it always shows. `message` is
  // authored copy from the server, which duplicates whatever we would say ourselves; it is
  // worth showing only when we have nothing of our own. Both go in Phase 2.
  const extra = outcome.debug ?? (copy ? null : outcome.message);

  return (
    <div className="notice">
      <strong className="notice-title">{title}</strong>
      <span className="notice-detail">
        {typeof detail === 'function' ? detail(outcome) : detail}
      </span>
      {extra && <code className="debug">{extra}</code>}
    </div>
  );
}
