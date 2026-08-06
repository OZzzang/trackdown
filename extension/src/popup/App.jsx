import { useEffect, useState } from 'react';

// The popup is a stateless renderer. It is destroyed the moment it loses focus — mid
// capture, mid request, whenever — so nothing important may live in this component's
// state. The worker parks every outcome in chrome.storage.session; this reads it back on
// mount so a reopened popup shows the result rather than a blank slate.
//
// Phase 1D replaces this with the real state machine and the error copy that goes with it.

export default function App() {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    chrome.storage.session.get('lastResult').then(({ lastResult }) => {
      if (lastResult) setOutcome(lastResult);
    });
  }, []);

  async function identify() {
    setBusy(true);
    setOutcome(null);
    try {
      const reply = await chrome.runtime.sendMessage({ type: 'START_CAPTURE' });
      // A worker that closes the channel without answering resolves this as undefined.
      // Rendering nothing for that case is indistinguishable from the click not working,
      // so name it instead.
      setOutcome(reply ?? {
        ok: false,
        reason: 'no_reply',
        message: 'The service worker closed the channel without answering.',
      });
    } catch (err) {
      setOutcome({ ok: false, reason: 'send_failed', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="popup">
      <h1>TrackDown</h1>
      <p className="tagline">Identify the song playing in this tab.</p>

      <button onClick={identify} disabled={busy}>
        {busy ? 'Listening…' : 'Identify song'}
      </button>

      <Outcome busy={busy} outcome={outcome} />

      <p className="phase">Phase 1B — capture pipeline.</p>
    </main>
  );
}

function Outcome({ busy, outcome }) {
  if (busy) return <p className="status">Recording 5 seconds…</p>;
  if (!outcome) return null;

  if (outcome.ok === false) {
    return <p className="status">{outcome.message}</p>;
  }

  const song = outcome.result;
  if (!song?.found) {
    return <p className="status">No match — live covers and remixes often aren&apos;t indexed.</p>;
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
