// Offscreen document — the only context in the extension that can record audio.
//
// It has a DOM, so MediaRecorder / AudioContext / getUserMedia are all available here and
// nowhere else. Chrome permits exactly one at a time: the service worker creates this
// document, hands over a stream ID, and closes it once this file answers.

const RECORD_MS = 5000;

const MIME = 'audio/webm;codecs=opus';

// Must stay in step with `host_permissions` in public/manifest.json. A fetch to a host that
// isn't listed there is blocked before it leaves, and the failure reads as the server being
// down rather than as a manifest problem.
const IDENTIFY_URL = 'http://localhost:3000/api/identify';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;
  if (message.type !== 'CAPTURE_TAB') return;

  captureAndIdentify(message.streamId)
    .then(sendResponse)
    .catch((err) => {
      console.error('[TrackDown] offscreen capture failed:', err);
      sendResponse({ ok: false, reason: 'capture_failed', message: err.message });
    });

  return true; // async — see the same note in the service worker
});

async function captureAndIdentify(streamId) {
  // Built BEFORE getUserMedia, not after. The tab falls silent the instant that promise
  // resolves — Chrome has redirected its output to us by then — and stays silent until we
  // reconnect it below. Constructing the graph here keeps that gap off the audible path;
  // doing it afterwards puts context startup inside the dropout the user hears.
  const audioContext = new AudioContext();
  if (audioContext.state === 'suspended') await audioContext.resume();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Legacy constraint form, and it has to be. The modern syntax ignores
        // chromeMediaSource entirely, so the call quietly succeeds against the default
        // microphone instead of the tab — which sounds plausible and is completely wrong.
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    });

    // Capturing a tab REPLACES its audio output. Route it straight back to the speakers
    // before recording anything, or the user's video is silent for the whole 5 seconds.
    audioContext.createMediaStreamSource(stream).connect(audioContext.destination);

    const blob = await record(stream);
    return await upload(blob);
  } finally {
    // Stop every track, or Chrome leaves the tab's recording indicator lit after we're
    // done — which reads as the extension still listening. `stream` is undefined if
    // getUserMedia itself threw; the context still needs closing either way.
    stream?.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  }
}

function record(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: MIME });

    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onerror = (event) => reject(event.error ?? new Error('Recording failed.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));

    recorder.start();
    setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), RECORD_MS);
  });
}

async function upload(blob) {
  const body = new FormData();
  // Field name must be `file`: multer is configured as .single('file') and rejects any
  // other name with LIMIT_UNEXPECTED_FILE, which the route maps to a 400.
  body.append('file', blob, 'capture.webm');

  // No Content-Type header on purpose — fetch has to set it so the multipart boundary
  // matches the body it just built.
  const response = await fetch(IDENTIFY_URL, { method: 'POST', body });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      reason: payload?.error ?? `http_${response.status}`,
      message: payload?.message ?? `Server returned ${response.status}.`,
    };
  }

  // A miss is a successful request — 200 { found: false }. Not an error, and not a 404.
  return { ok: true, result: payload };
}
