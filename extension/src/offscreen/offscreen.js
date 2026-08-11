// Offscreen document — the only context in the extension that can record audio.
//
// It has a DOM, so MediaRecorder / AudioContext / getUserMedia are all available here and
// nowhere else. Chrome permits exactly one at a time: the service worker creates this
// document, hands over a stream ID, and closes it once this file answers.
//
// What it does NOT have is the rest of the extension API surface. `chrome.runtime` is the
// only extensions API offscreen documents support — `chrome.storage` is undefined here, and
// touching it throws. Anything this file learns and wants remembered has to be sent to the
// worker. See `reportPhase`.

import { RECORD_MS, reportPhase } from '../shared/capture-state.js';

const MIME = 'audio/webm;codecs=opus';

// `__API_ORIGIN__` is replaced at build time by vite.config.js, which writes the same origin
// into the manifest's `host_permissions`. They have to agree — a fetch to a host missing
// from host_permissions is blocked before it leaves, and reads as the server being down
// rather than as a manifest problem — so neither is written by hand any more, and
// verify-dist.js fails the build if they drift apart.
const IDENTIFY_URL = __API_ORIGIN__ + '/api/identify';

// Below this RMS the clip carries no signal worth spending an API call on. Full scale is
// 1.0 and music sits around 0.05–0.2, so 0.0005 (about −66 dBFS) is two orders of magnitude
// below anything a person would call quiet. Deliberately conservative: refusing to identify
// a real but faint song is a worse failure than sending five seconds of near-silence.
const SILENCE_RMS = 0.0005;

// A tab that is muted or paused emits digital silence — samples of exactly zero, not merely
// small ones. That is unambiguous in a way an RMS threshold never is, so it is worth
// checking early and giving the answer back in one second instead of five.
const EARLY_SILENCE_CHECK_MS = 1200;

// The analyser window is fftSize/sampleRate ≈ 43ms at 48kHz, so polling every 50ms reads
// very nearly all of the audio rather than sampling a fraction of it. That matters for the
// exactly-zero test, which a missed window could otherwise pass by accident.
const POLL_MS = 50;
const FFT_SIZE = 2048;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;
  if (message.type !== 'CAPTURE_TAB') return;

  captureAndIdentify(message.streamId)
    .then(sendResponse)
    .catch((err) => {
      console.error('[TrackDown] offscreen capture failed:', err);
      // `debug`, not `message`: this is exception text, not copy. This console is gone
      // milliseconds from now when the worker closes the document, so carrying the string
      // out with the outcome is the only way anyone sees it.
      sendResponse({ ok: false, reason: 'capture_failed', debug: err.message });
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
  let meter;
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
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    meter = createLevelMeter(source);

    const { blob, peak, rms } = await record(stream, meter);

    // Nothing playing. The commonest real cause is not a bug at all — an Instagram Reel
    // autoplaying muted, or a paused video the user forgot to start — so this is a normal
    // outcome with its own copy, not an error. Bailing here also spares the API call.
    if (peak === 0 || rms < SILENCE_RMS) {
      console.log(`[TrackDown] silent capture (peak ${peak}, rms ${rms.toFixed(6)})`);
      return { ok: false, reason: 'no_audio' };
    }

    await reportPhase('identifying');
    return await upload(blob);
  } finally {
    // Stop every track, or Chrome leaves the tab's recording indicator lit after we're
    // done — which reads as the extension still listening. `stream` is undefined if
    // getUserMedia itself threw; the context still needs closing either way.
    meter?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  }
}

// Taps the capture graph to measure what we are actually recording. The analyser's output
// goes nowhere — connecting a node's input is enough to feed it, and leaving its output
// unconnected keeps it off the path back to the speakers.
function createLevelMeter(source) {
  const analyser = new AnalyserNode(source.context, { fftSize: FFT_SIZE });
  source.connect(analyser);

  const frame = new Float32Array(analyser.fftSize);
  let peak = 0;
  let sumOfSquares = 0;
  let counted = 0;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(frame);
    for (const sample of frame) {
      const magnitude = Math.abs(sample);
      if (magnitude > peak) peak = magnitude;
      sumOfSquares += sample * sample;
    }
    counted += frame.length;
  }, POLL_MS);

  return {
    get peak() {
      return peak;
    },
    get rms() {
      return counted === 0 ? 0 : Math.sqrt(sumOfSquares / counted);
    },
    stop() {
      clearInterval(timer);
      analyser.disconnect();
    },
  };
}

function record(stream, meter) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: MIME });
    const timers = [];

    const settle = (finish) => {
      timers.forEach(clearTimeout);
      finish();
    };

    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);

    recorder.onerror = (event) =>
      settle(() => reject(event.error ?? new Error('Recording failed.')));

    recorder.onstop = () =>
      settle(() =>
        resolve({
          blob: new Blob(chunks, { type: recorder.mimeType }),
          peak: meter.peak,
          rms: meter.rms,
        }),
      );

    recorder.start();

    // Only now is the recorder genuinely running, so only now does the popup's five-second
    // progress bar have an honest start time — everything before this point is the worker's
    // `starting`. Not awaited, and it cannot be: this is a Promise executor, not an async
    // function. Safe here where it is not before the upload, because five seconds of
    // recording follow and nothing can overtake the report inside that window.
    reportPhase('recording');

    const stop = () => recorder.state !== 'inactive' && recorder.stop();
    timers.push(setTimeout(() => meter.peak === 0 && stop(), EARLY_SILENCE_CHECK_MS));
    timers.push(setTimeout(stop, RECORD_MS));
  });
}

async function upload(blob) {
  const body = new FormData();
  // Field name must be `file`: multer is configured as .single('file') and rejects any
  // other name with LIMIT_UNEXPECTED_FILE, which the route maps to a 400.
  body.append('file', blob, 'capture.webm');

  let response;
  try {
    // No Content-Type header on purpose — fetch has to set it so the multipart boundary
    // matches the body it just built.
    response = await fetch(IDENTIFY_URL, { method: 'POST', body });
  } catch {
    // fetch rejects with an indistinguishable TypeError for "no network" and "nothing
    // listening on that host", so navigator.onLine is what separates them. It answers a
    // narrower question than it looks like — whether this machine has a network interface
    // at all — so a captive portal or dead uplink still reads as the server being down.
    // Wrong in that case, but wrong in the direction that suggests "try again", which is
    // the correct advice either way.
    return navigator.onLine
      ? { ok: false, reason: 'server_unreachable' }
      : { ok: false, reason: 'offline' };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      reason: payload?.error ?? `http_${response.status}`,
      // Seconds until the rate limit window reopens. Only 429 carries it; the popup turns
      // it into a sentence, and copes with null because the header is not guaranteed.
      retryAfter: payload?.retryAfter ?? null,
      message: payload?.message ?? `Server returned ${response.status}.`,
    };
  }

  // A miss is a successful request — 200 { found: false }. Not an error, and not a 404.
  return { ok: true, result: payload };
}
