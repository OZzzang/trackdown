import { useState } from 'react';

// The popup is a stateless renderer. It is destroyed the moment it loses focus — mid
// capture, mid request, whenever — so nothing important may live in this component's
// state. Phase 1D moves the real state machine into chrome.storage.session and has this
// read from it on mount.

export default function App() {
  const [status, setStatus] = useState(null);

  async function ping() {
    setStatus('…');
    try {
      const reply = await chrome.runtime.sendMessage({ type: 'PING' });
      setStatus(reply?.type === 'PONG' ? 'worker responded' : 'unexpected reply');
    } catch (err) {
      setStatus(`no worker: ${err.message}`);
    }
  }

  return (
    <main className="popup">
      <h1>TrackDown</h1>
      <p className="tagline">Identify the song playing in this tab.</p>

      <button onClick={ping}>Ping service worker</button>
      {status && <p className="status">{status}</p>}

      <p className="phase">Phase 1A — scaffold only, no capture yet.</p>
    </main>
  );
}
