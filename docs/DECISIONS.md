# Decisions

One entry per non-obvious call. 

Format: **Date — Decision.** What was rejected, and why.

---

**2026-07-26 — Single repo, two folders (`extension/`, `server/`).**
Rejected separate repos: one person shipping in a week means two deploys, two histories, and
a cross-repo change every time the API contract moves. Separation is demonstrated by the
folder boundary and the HTTP-only interface, not by having two GitHub URLs.

**2026-07-26 — Backend proxy instead of calling AudD from the extension.**
Extension source is fully public once shipped — anyone can unzip it and read an embedded API
token. The server exists to hold the secret. This is also what makes the project full-stack
rather than a frontend toy.

**2026-07-26 — AudD over ACRCloud for v1.**
Simpler auth (bearer token vs. request signing). Provider-specific code is isolated in
`server/src/services/audd.js` so switching later touches one file.

**2026-07-26 — React for the popup only; service worker and offscreen doc stay vanilla.**
The popup is real UI and gets tabs plus a list in Phase 3, so React earns its place. The
other two contexts have no UI at all. Cost is ~1hr of Vite multi-entry config.

**2026-07-26 — Ship Phases 0–2 before building 3–4.**
Chrome Web Store review takes days to weeks and can't be accelerated. Starting that clock
early is worth more than submitting a more featureful v1. Updates ship during review.

**2026-07-26 — Named "TrackDown."**
Double meaning (track = song, track down = find). Chosen for legibility to someone skimming
the repo. Deliberately avoided surveillance-flavored names (Eavesdrop, Snoop, Wiretap) —
counterproductive for an audio-recording extension that needs a privacy policy and faces
extra store scrutiny.

---

**2026-07-27 — Phase 0 gate cleared: AudD accepts `webm/opus` untranscoded.**
A clip straight out of Chrome's `MediaRecorder` matched on the first attempt. The
contingency — ffmpeg transcode step, container-based host, extra deploy complexity — is
not needed and is dropped. Phase 1C stays a plain Express proxy.

**2026-07-27 — The user waits on the capture, not the network.**
Round trip to AudD measured 0.43–1.29s across runs. The 8s recording dominates perceived
latency by roughly an order of magnitude. So the Phase 1D progress state belongs on the
recording phase, not on the request, and shortening the clip is the only real speed lever.

**2026-07-27 — AudD can return a correct fingerprint with wrong metadata. Design for it.**
Bieber's "Baby" resolves to "Take Your Mama" by Scissor Sisters — identically across two
different 10s windows (verified as distinct files by checksum). Identical output from
different input is the signature of a correctly matched but *mislabeled* database entry,
not a fingerprint collision. Every match so far has landed on a party compilation
("Pop Party 13", "The Playlist: New Year's Party"), and an otherwise-correct All Of Me
match returned an Apple Music link to a Tiësto remix while Spotify pointed elsewhere.

No `score` field is returned, so there is nothing to threshold on — the server cannot tell
a good result from a bad one.

Cross-provider disagreement was considered as a confidence proxy and **rejected**: on the
Baby result, AudD's own title, the Spotify link and the Apple link all agreed on the wrong
song. Providers inherit the error because AudD resolves to one entry and then looks that
entry up in each of them. The error is also systematic per track — two different 10s
windows returned identical output — so re-querying or sampling a different section cannot
detect it either. No internal consistency check works.

That leaves two real options: query a second provider (ACRCloud) for a genuine second
opinion, at double the cost and complexity, or design the UI so the user can verify
cheaply. Taking the second for v1 — the user just heard the song and has the video in
front of them, which is a verification path Shazam does not have.

---

**2026-07-27 — Q3 answered: speech over music is not a failure mode.**
Measured with `scratch/mix.html`, which mixes a known-matching clip against a speech track
at controlled gains rather than relying on found footage. Matched at parity (music and
speech both ≈ −23 dB), at −12 dB (typical vlog mix), and at −20 dB (quiet background
music). Every render verified as a distinct file by checksum.

The fingerprint tolerates considerably worse than real content presents, so the two vlog
misses seen during testing were **not** caused by the speech overlay. The likely cause is
unindexed stock/royalty-free library music (Epidemic Sound, Artlist and similar), which is
a catalogue limit rather than a signal-quality one. Phase 1D no-match copy should therefore
say the track may not be in the database — not suggest trying a cleaner or quieter section,
which would be misleading advice.

Rejected the obvious approach of testing against real vlogs: every sample varies on three
axes at once (is the track indexed, how loud is the music, how much noise sits on top), so
results are anecdotes rather than measurements.

**2026-07-27 — Q2 answered: 3s matches, but capture is set to 5s.**
At a realistic vlog mix (music 12 dB under speech), 8s, 5s and 3s all matched. Round trip
fell from 1.28s to 0.56s as the upload shrank, so a shorter clip wins twice — less time
recording *and* less time uploading.

Chose 5s over 3s. The 3s result comes from the chorus of one song, which is the strongest
possible fingerprint: dense, distinctive, high-energy. Users click whenever they happen to
hear something, frequently a sparse intro or a bridge, where a 3s window has far less to
work with. 5s keeps well clear of the proven floor while still cutting perceived latency
by ~37% against the original 8s.

Rejected keeping 8s: latency is capture-bound, and three seconds is the difference between
a tool that feels instant and one that feels broken.

Revisit with real usage data, or sooner by testing a *verse* from a second song at 3s and
5s — the weak case this measurement did not cover.

---

**2026-07-27 — AudD in development, ACRCloud in production. Provider is a config value.**
ACRCloud is clearly the better provider (see the measurement below) but bills a $50 minimum
up front, which is hard to justify before the extension has a single user. So development
runs on AudD's free tier and `PROVIDER` switches to ACRCloud before the Phase 2 deploy.

Rejected renaming `services/audd.js` to `services/acrcloud.js`: both adapters ship and the
choice becomes configuration. Rejected shipping v1 entirely on AudD: a 20% confidently-wrong
rate is the one failure users punish, and $50 is easy to justify once the thing is real.

The risk this creates is dev/prod divergence — testing a path you don't ship. Neutralized by
pushing every provider difference into the normalizer: artwork fetched server-side from the
Spotify track ID when the provider omits it, `confidence` optional and null for AudD, and
result copy hedged unconditionally rather than keyed off a score only one provider returns.
Nothing above `services/` can tell which provider answered.

**Pre-launch checklist:** buy ACRCloud several days before deploying, not the day of. Run
`PROVIDER=acr scratch/batch.sh` plus a full end-to-end pass through the real server.
ACRCloud must never be exercised for the first time in production.

**2026-07-27 — ACRCloud measured 10/10 against AudD's 6/10.**
Measured both providers against the same ten clips — same songs, same sections, same audio,
vendor as the only variable.

| | AudD | ACRCloud |
|---|---|---|
| Correct | 6/10 | **10/10** |
| Confidently wrong | 2 | 0 |
| No match | 2 | 0 |
| Confidence score | none | yes |
| Album metadata | party compilations | canonical releases |
| Accepts `webm/opus` | yes | yes |

ACRCloud fixed both of AudD's misses (7 Years, YOASOBI) and both of its wrong answers
(Umbrella → "Def Jam UK Mix 1", Mockingbird → "Top 5 Eminem live performances by NiYove").

Costs of the switch, accepted: HMAC request signing instead of a bearer token (already
written and verified in `scratch/identify-acr.sh`), and no artwork or Apple Music URL in
the response — cover art must be fetched server-side from the Spotify track ID.

Pricing checked: ACRCloud bills a $50 minimum, pay-as-you-go. That cost is what produced the
dev/prod split recorded above rather than an outright switch. The isolation rule from the
AudD entry is what kept the option open at all — and resolving this before `server/` exists
means it costs a config value instead of a refactor.

---

**Phase 0 complete.** All four questions answered, the gate cleared on Q1, and the provider
choice re-decided on evidence. Spike rigs live in `scratch/`, which is tracked — they are the
evidence behind the entries above, and only their audio output is ignored. `spike.html`
captures clips, `mix.html` builds controlled mixes, `identify.sh` / `identify-acr.sh` query
the two providers, `parse.js` / `parse-acr.js` normalize both to one contract, and
`batch.sh` runs a folder of clips against either (`PROVIDER=acr`).

---

**2026-07-30 — Vite content hashing disabled, and a build guard added to keep it that way.**
`manifest.json` names `service-worker.js` by exact path, and the worker will name
`offscreen.html` the same way in 1B. Vite's default `assets/[name]-[hash].js` breaks both
without throwing: the extension still loads and the worker simply never runs, which reads as
"my code does nothing" rather than as a build error.

Overriding `entryFileNames` fixes it, but nothing stops the setting being lost later, so
`extension/scripts/verify-dist.js` re-resolves every exact path after each build and fails
the build when one is missing. Negative-tested by renaming `service-worker.js` to
`service-worker.a1b2c3.js` and confirming a non-zero exit.

Two layout choices follow from the same constraint. `manifest.json` lives in `public/`, which
Vite copies to the dist root verbatim — the alternative was adding `vite-plugin-static-copy`
to move a single file. And `popup.html` / `offscreen.html` sit at the extension root rather
than beside their JS, because Vite emits an HTML entry at its path relative to the project
root: `src/popup/index.html` would land at `dist/src/popup/index.html`, build output that
reads like source and a manifest path that looks uncompiled.

**2026-07-30 — Phase 1C before Phase 1B. Reordered against PLAN.md.**
`PLAN.md` orders phases riskiest-unknown-first, and labels 1B the hardest part. Taking 1C
first anyway, because that principle is about unknowns which can force an *architecture*
change, and 1B no longer holds one. Phase 0 retired it when AudD accepted `webm/opus`
untranscoded. What remains in 1B — the `AudioContext` passthrough, the offscreen document
lifecycle — is fiddly implementation that cannot change the server contract, the hosting, or
the data flow. Deferring an unknown is a risk; deferring known-fiddly work is scheduling.

The dependency also runs the other way. 1C's milestone is a `curl` command and needs no
extension at all, while 1B's step 9 POSTs to a server that would not exist yet. Building 1C
first removes an ordering constraint rather than creating one. The `scratch/` clips are real
fixtures rather than approximations: `spike.html` produced them with `MediaRecorder`, the
same encoder `tabCapture` feeds in 1B.

Rejected stopping 1B one step short at "5s Blob in hand". It needs throwaway code written
only to prove the Blob is real, and it leaves the interesting half — whether any of this
actually identifies a song — unproven. With the server already up, 1B lands end to end.

Accepted risk: if capture surprises us in a way that shifts the contract (chunking, MIME),
the server needs a tweak. Low, because Phase 0 measured the format directly.

---

**2026-07-30 — `PROVIDER` accepts `acr` as an alias for `acrcloud`.**
The two spellings were already in the repo pointing at the same thing: `.env.example` and
CLAUDE.md say `acrcloud` (matching `services/acrcloud.js`), while `scratch/batch.sh` and the
pre-launch checklist above say `PROVIDER=acr`. Canonical is `acrcloud`; `acr` maps to the
same adapter.

Rejected picking one and rewriting the other references. The checklist entry is inside a
dated decision and is meant to run days before the production switch — the one moment where
discovering a spelling mismatch is most expensive. A three-line alias table costs less than
that risk. An unrecognized value refuses to boot rather than surfacing as a 500 on the first
real request.

**2026-07-30 — Config loads through Node's `--env-file-if-exists`, not `dotenv`.**
Node has read `.env` natively since 20.6 (`--env-file`), so the dependency buys nothing. The
`--env-file-if-exists` variant, added in 20.12 and the reason `package.json` pins that
engine floor, matters specifically for deployment: Railway and Render inject env vars
from their dashboard and there is no `.env` file in the container, which plain `--env-file`
treats as a fatal error. Server dependencies are therefore just express, multer and
express-rate-limit.

**2026-07-30 — Rate limiting: two per-IP windows now, the global breaker stays Phase 2.**
10/hour stops a burst; 50/day stops a slow drip that would never trip the hourly window.
Both are per-IP and therefore bound abuse, not spend — a distributed caller still costs
money. The global daily circuit breaker that actually caps the bill is deliberately left in
Phase 2, where deployment makes it real.

`TRUST_PROXY` defaults to **off**. Behind Railway/Render the client IP arrives in
`X-Forwarded-For` and the limiter needs it, but trusting that header when not behind a proxy
lets anyone forge an IP and bypass rate limiting entirely. Off locally, set at deploy time.

**2026-07-30 — Upstream errors become a generic 502; the provider's wording never leaves
the server.** Verified rather than assumed: an invalid `AUDD_TOKEN` produces an AudD message
naming the token and the account's subscription state. The client receives
`{"error":"upstream_unavailable"}` and the detail goes to our log. Provider errors are
exactly the class of string that leaks a credential or an internal hostname.

**2026-07-30 — Phase 1C found a Phase 2 blocker: no Spotify credentials exist.**
ACRCloud returns no artwork, so CLAUDE.md's rule is that cover art is filled server-side
from the Spotify track ID it does return. That needs Spotify client-credentials keys, and
`.env.example` had no entry for them — so switching `PROVIDER` in production would have
silently shipped a popup with no album art.

Placeholders added to `.env.example` and a TODO left in `services/acrcloud.js`. Folded into
the pre-launch checklist: this now has to be done alongside buying ACRCloud, not after.
Note it is the client-credentials flow, unrelated to the user-facing Spotify OAuth in
Phase 4 — same vendor, different grant, different keys.

**2026-08-05 — Tab capture uses the legacy `mandatory` constraint form.**
The modern `getUserMedia` constraint syntax does not reject `chromeMediaSource` — it ignores
it, and the call succeeds against the **default microphone** instead of the tab. The failure
therefore looks like a working recording of the room rather than an error, and would have
been found by listening rather than by reading a log. Rejected writing it the modern way for
tidiness; the deprecated form is the only one that works.

**2026-08-05 — The `AudioContext` is built before `getUserMedia`, not after.**
Capturing a tab replaces its audio output rather than tapping it, so the tab is silent from
the instant `getUserMedia` resolves until the passthrough is connected. Everything inside
that window is audible as a dropout. Constructing the context beforehand keeps context
startup off that path. A short blip remains and is structural — Chrome redirects the stream
on its side — so this shortens the gap rather than removing it.

**2026-08-05 — The offscreen document is closed after every capture, not kept warm.**
Chrome permits exactly one, and leaving it open means the next click fails on
`createDocument`. Closing it also drops the tab's recording indicator, which otherwise stays
lit and reads as the extension still listening. Both teardown steps sit in `finally` blocks:
tracks stop and the context closes even if the upload throws, and the document closes even
if the whole relay throws. Rejected keeping it alive to save startup cost — the cost is
milliseconds against a 5s capture, and the failure mode is a dead second click.

**2026-08-05 — Blocked pages are screened in the worker, before `getMediaStreamId`.**
`chrome://`, `chrome-extension://`, `devtools://`, `view-source:` and the Web Store all
throw, but with a message that never says which rule was hit. Screening first yields a
sentence Phase 1D can render as-is. The Web Store check is host-based rather than a scheme
check because Chrome blocks extensions there specifically, so no extension can interfere
with installing or removing another.

**2026-08-05 — Capture outcomes are written to `chrome.storage.session` before responding.**
A 5s capture plus a round trip outlives the popup whenever the user looks away, and a closed
popup means `sendResponse` lands nowhere. The worker parks the outcome first, then answers;
the popup reads it back on mount. Phase 1D builds the real state machine on this, but the
write has to exist now or results are lost rather than merely unrendered.

**2026-08-05 — Phase 1B confirmed the AudD metadata weakness on live audio.**
Phase 0 recorded it from the spike; a real capture reproduced it. AudD returned
`Kokoronashi` credited to a cover uploader rather than the canonical release — the
fingerprint was correct and the metadata was not. A confidence score would not have caught
this, because the match itself was right. This is why the result hedge in the popup is
unconditional rather than score-gated, and it is an argument for `PROVIDER=acrcloud` in
production beyond raw accuracy.

A separate observation, kept because it costs an hour if unknown: **the popup picks up a
rebuild on its own, the service worker does not.** The popup is re-fetched from `dist/` each
time it opens; the worker stays resident until the card is reloaded at `chrome://extensions`.
A new popup talking to a stale worker looks like new code failing. A changed popup is not
evidence the worker reloaded — its console is.

**2026-08-08 — The capture state machine lives in `chrome.storage.session`; the popup only
renders it.** The popup is destroyed the moment it loses focus, so "popup closed
mid-request" is not an edge case, it is the normal case. Rather than special-case it, all
four states (`starting`, `recording`, `identifying`, `done`) are written to one storage key
by whichever context owns that transition, and the popup subscribes to
`storage.session.onChanged`. A write reaches an open popup as an event and a reopened one as
a read, and the two are the same code path — there is no reconnect logic and no message that
can be missed, because the popup was never holding the state. Rejected keeping a long-lived
port open from the popup: it would need the closed case handled anyway, and then there would
be two mechanisms.

Consequence worth naming: the `recording` transition is written by the **offscreen document**
at `recorder.start()`, not by the worker beforehand. Only the offscreen document knows when
recording actually began, and the popup's five-second progress bar is only honest if it
starts from that instant. The bar is a CSS animation with a negative `animation-delay`, so a
popup opened two seconds in joins it two seconds in.

**2026-08-08 — Silence is detected in two tiers, and only the cheap tier is fast.** An
`AnalyserNode` taps the capture graph — input connected, output left dangling, so it feeds
without rejoining the path to the speakers. A muted or paused tab emits samples of *exactly*
zero, which is unambiguous in a way a threshold never is, so a check at 1.2s aborts on
`peak === 0` and answers in one second instead of five. Anything nonzero runs the full 5s and
is judged on RMS against 0.0005 (≈ −66 dBFS, two orders of magnitude below quiet music).
Deliberately conservative in that direction: refusing to identify a real but faint song is a
worse failure than spending one API call on near-silence. The analyser window is ~43ms at
48kHz and polling is every 50ms, so the exactly-zero test sees nearly all the audio rather
than a sample of it — a gap could otherwise pass the test by accident.

**2026-08-08 — `tab.mutedInfo.muted` is grounds for refusing; `tab.audible` is not.** Muted
is a *state* and captures as guaranteed silence, so the worker refuses immediately with copy
that names the one-click fix. `audible === false` is an *instant* — a quiet intro or a gap
between tracks satisfies it just as well as a paused video — and refusing on it would produce
confident, wrong refusals on tabs that are genuinely playing. Rejected using it even as a
hint. Neither field needs a permission; only `url` and `title` are gated by `tabs`.

**2026-08-08 — Offline and server-down are split by `navigator.onLine`, and the split is
knowingly imperfect.** `fetch` rejects with an indistinguishable `TypeError` for "no network"
and "nothing listening on that host", so the only available discriminator is `navigator.onLine`
— which answers the narrower question of whether this machine has a network interface at all.
A captive portal or a dead uplink therefore reads as the server being down. Accepted rather
than papered over with a reachability probe: the two messages differ only in which of them
says "check your connection", both end in "try again", and a probe would add a second request
to every failure to sharpen a distinction the user acts on identically.

**2026-08-08 — All user-facing copy lives in the popup; the layers below return a `reason`.**
Worker, offscreen document and server each return a machine-readable `reason` plus optional
data (`retryAfter`), and the popup owns the sentences. Two layers writing copy is how copy
drifts, and the server's `message` fields have to stay generic because they are an API
contract, not UI. One deliberate exception: `unsupported_page` carries its detail up from the
worker, because only the worker knows which rule was hit — a `chrome://` scheme, the Web
Store, a tab with no page. The popup supplies the headline, the worker supplies the sentence
under it. An unrecognised `reason` falls back to generic copy *and* prints the raw message;
that debug line is tagged for removal in Phase 2, since a store build must not show users
internal strings.

**2026-08-08 — A non-terminal state older than 30s is presumed dead.** Nothing guarantees a
`done` write: the worker can be torn down mid-capture, the offscreen document can crash, the
tab can close. Without an expiry the popup sits at "Listening…" forever, which is the one
failure mode that looks like our bug even when it isn't. The budget is measured from the last
transition rather than from the start, so each phase gets its own. Checked twice, on purpose:
once when a state is read at mount, so a stale one never renders even for a frame, and once
on a timer for a state that goes quiet while the popup is watching.

**2026-08-08 — `PROVIDER=acrcloud` in development too; the AudD trial ran out.** The switch
cost one line in `server/.env` and no code, which is the seam in `services/index.js` doing
exactly what it was built for. `/health` reports the change and the control clip round-trips
in 1.4s with `confidence: 85` — a field AudD never sent, now flowing through the normalizer
untouched by anything above `services/`.

Two consequences, both known in advance and neither fixed here. **The popup has no cover
art:** ACRCloud returns none, the Spotify fill is Phase 2, and `SPOTIFY_CLIENT_ID` /
`SPOTIFY_CLIENT_SECRET` are not in `.env` at all — the Phase 1C finding, arriving earlier
than expected because the switch was forced rather than planned. `appleMusicUrl` is null for
the same reason. **Identification now costs money per call**, which turns the Phase 1D
silence detection from a latency optimization into a cost one: a muted Reel or a paused video
is refused before any request leaves.

`AUDD_TOKEN` stays in `.env` and `audd` stays selectable, so the comparison rig in `scratch/`
still runs and the switch is reversible by editing one line.

Worth recording because it is the first time the provider seam was exercised under pressure
rather than in a test: nothing above `services/` was touched, and the popup — which hedges
unconditionally rather than keying off a confidence score — needed no change even though the
shape of what it receives genuinely did.

**2026-08-08 — `chrome.storage` does not exist in an offscreen document, and the state
machine had to be rebuilt around that.** The 1D design made every context write its own
transitions to `chrome.storage.session`. That is wrong for exactly one of them: per Chrome's
offscreen documentation, *"The runtime API is the only extensions API supported by offscreen
documents."* Not gated by `permissions`, not degraded — `chrome.storage` is simply undefined
there, and the manifest listing `storage` makes it look granted.

The failure was quiet in the worst way. `reportPhase`'s predecessor was called twice: once
fire-and-forget after `recorder.start()`, where `.catch(() => {})` swallowed the TypeError
whole, and once awaited before the upload, where it threw and surfaced as the generic
`capture_failed`. So the symptom was a capture that recorded for its full five seconds and
then reported that the tab may have closed — pointing at teardown, at tab lifetime, at
YouTube, at anything except a storage call. Two things would have caught it sooner: the
progress bar never appearing (the swallowed write was the one that triggers it), and the raw
error message, which the popup was hiding — see below.

Fix: the worker is the sole writer. The offscreen document reports its two transitions over
`chrome.runtime.sendMessage`, the one API it does have. `reportPhase('identifying')` is
**awaited**, and the worker completes the storage write **before** responding — because the
worker writes `done` the moment this document answers the capture message, and a phase report
still in flight then would land after the terminal state and strand the popup on
"Identifying…" until the staleness timer fired. `reportPhase('recording')` is fire-and-forget
because five seconds of recording follow it and nothing can overtake it.

**2026-08-08 — Exception text and fallback copy are separate fields: `debug` and `message`.**
Took two wrong attempts to see, and both failures came from one field doing two jobs.

Attempt one showed the debug line only for *unrecognised* reasons, reasoning that a reason
with friendly copy needs no raw detail. Exactly backwards: `capture_failed` is the catch-all
for anything thrown inside the offscreen document — where the console dies with the document
milliseconds later — so it is simultaneously the reason with friendly copy and the reason
whose detail matters most. Having written copy for it is what hid the `chrome.storage`
TypeError above. Attempt two therefore showed the message whenever it differed from the
sentence already displayed, which promptly printed the server's "Song identification is
unavailable right now" underneath our own "The music service is not answering right now" —
the same sentence twice in two voices.

Neither rule could work, because `message` carried both raw `err.message` strings and
human-authored copy from the server, and no heuristic separates those reliably. Split them at
the source instead. **`debug`** is exception text, written only by a `catch`, never meant for
a reader, and always rendered — it is often the only surviving record. **`message`** is
authored fallback copy, rendered only when the popup has no copy of its own for that reason.
The producers now say which one they mean rather than the renderer guessing. Both are
Phase 2 removals.

**2026-08-08 — Cover art will come from the Spotify Web API, not from oEmbed.** Planned, not
built; the shape of the work is in `docs/PLAN.md` under Phase 2.

The switch to ACRCloud lost album art, and the popup has rendered text-only results since.
Both candidate fixes take the same input — the Spotify track ID ACRCloud already returns —
so the choice was purely about which endpoint to depend on.

`https://open.spotify.com/oembed?url=…` was tested and works: no credentials at all, and it
returned genuine 300×300 artwork for the control clip's track, which is ample against a popup
that renders art at 56px. Rejected anyway. oEmbed exists to embed players; `thumbnail_url` is
a side effect of that, its rate limits are unpublished, and the image CDN hostname is not a
contract. That is a fine trade for a spike and a poor one for something on the Web Store with
a name attached, where the failure mode is every user's artwork breaking at once with no
warning and no recourse.

The Web API costs a Spotify app registration and a client-credentials token flow — perhaps
sixty lines with caching and refresh — and in exchange the endpoint is documented, versioned
and supported. `.env.example` has anticipated this since Phase 1C, which is the point at which
the gap was first spotted.

Rejected the middle option of shipping oEmbed now and swapping it before submission. Nothing
downstream of "it works" would have forced the swap, and the code most likely to survive to
production is the code that is already there.

One design note worth fixing now so it is not re-argued: this hooks into `services/index.js`,
not `acrcloud.js`. Filling missing artwork is a normalization concern, not a provider quirk —
CLAUDE.md's rule is that provider differences are the normalizer's problem — and hooking the
seam covers any future provider that omits art without touching its adapter.

---

**2026-08-11 — The global daily budget fails closed, and counts attempts rather than
successes.** Per-IP limits bound one caller; they do nothing about the same volume arriving
from a hundred addresses, and the provider bills per call, so until now total spend was
unbounded. `middleware/circuitBreaker.js` is the backstop: a global cap per UTC day,
default 500, `DAILY_IDENTIFY_BUDGET` to override, and 0 as a kill switch that stops
identification without stopping the server.

Failing closed was the whole point, so the arguable calls are all in the details:

**503, not 429.** A 429 says "you did too much" and would send the popup down its "Too many
searches" path — blaming a first-time user for everyone else's traffic. 503 says the service
is out of capacity, which is true, and it gets its own copy: "TrackDown is at capacity."

**Attempts count, including the ones that 502.** An upstream that answered with an error may
still have billed for it. Over-counting costs a few refusals; under-counting costs money, and
would hand an attacker a free drain — any request they could make fail upstream would be
uncounted.

**The spend happens after the file check, and the breaker before the upload.** A malformed
request never reaches the provider, so charging it against the day would let junk traffic
exhaust the budget for free. In the other direction, the breaker sits ahead of `receiveClip`
so a refused request doesn't cost a 2MB upload it was always going to turn away. Verified
both ways: a fileless POST returned 400 without consuming budget, and two 502s did consume it.

**A UTC calendar day, not a rolling 24h window.** Rolling would be stricter — it closes the
burst at 23:59 followed by another at 00:01, which spends two days in two minutes. Taken
anyway, because the reset has to be explicable: "try again tomorrow" is something a user can
act on and a boundary burst still bounds spend *per day*, which is the quantity at risk.

**In memory, which is the honest limit of it.** A restart resets the day, and a second
instance would get its own full budget rather than sharing one. Accepted for the single small
instance Phase 2 deploys — a database round trip on every request costs more than it protects
until there is something to share state with. Revisit in Phase 3, when Mongo is present
anyway. The budget is printed at boot partly so the log records when the counter last reset.

**2026-08-11 — Retry times round to nearest, not up.** The daily budget resets at UTC
midnight, so `retryAfter` is routinely hours rather than minutes and rounding up turned 6h01m
into "about 7 hours" — an hour of overstatement on a sentence already hedged with "about".
Rounding down is self-correcting: a user who comes back early gets the same function saying
"Try again in 60 seconds". `retryPhrase` also lost its lead-in sentence so it composes onto
whatever the caller says first; the 3600s case still renders "about 60 minutes", so the
rate-limit copy verified in Phase 1D is unchanged.

**2026-08-11 — Cover art comes from the iTunes Search API. Spotify's Web API is no longer
available to us at all.** This supersedes the 2026-08-08 entry above, which chose the Spotify
Web API over oEmbed. That entry is kept rather than deleted: the reasoning in it was sound on
the facts available, and what changed was the facts.

Spotify now gates catalogue reads behind the *app owner* holding Premium. This was established
empirically, not inferred — a client-credentials token issued fine, and
`GET /v1/tracks/{id}` answered `403 Active premium subscription required for the owner of the
app`. Worth recording how close that came to being missed: the dashboard's "which APIs" list
carries a Premium note that belongs to the Web Playback SDK, so Web API appeared free and
tickable, and the app registered without complaint. Only the actual call told the truth.

Deezer was checked next and ruled out on data. Dumping ACRCloud's raw response for the control
clip showed `external_metadata` containing **Spotify only** and `external_ids` empty — no
Deezer ID, no ISRC. There is nothing to look Deezer up by.

That left three: iTunes Search, Spotify oEmbed, or no artwork at all. Chose iTunes.

**Rejected oEmbed**, having earlier tested it working and returning correct 300×300 art with no
account. It is exact — a lookup by Spotify track ID rather than a search — which is genuinely
better than what iTunes offers. But oEmbed exists to return embeddable player HTML, and
`thumbnail_url` is incidental to that; using it as an artwork API on a store-published product
carrying the author's name is a terms exposure that does not degrade gracefully the way a
technical failure does. iTunes Search is public, unauthenticated and *documented for exactly
this* — third-party lookup of the catalogue. Trading exactness for legitimacy was the whole
point of the choice.

**Rejected shipping without artwork**, which the ranked alternatives made a real option and
which cost nothing. iTunes turned out to need no account, no key and no ongoing cost, so the
only thing it spends is a ~0.4s lookup on a cache miss and nothing on a hit.

The cost of the trade is fuzzy matching, and it is handled by refusing to guess: a candidate is
accepted only when title **and** artist both match after normalization. A title-only match
returns null. Verified across seven cases including the one that matters — the correct title
paired with the wrong artist yields no artwork rather than someone else's album cover. Wrong art
would be worse than none, because every result is already hedged as a "best match" precisely
because provider metadata can be wrong, and a confident picture attached to a wrong title
undoes that warning.

Comparison is substring-either-way rather than equality, because providers disagree at the
edges of the same name: ACRCloud's "League of Legends" is iTunes' "League of Legends Music",
and exact matching rejects the correct answer over a suffix.

**2026-08-11 — The API origin is a build-mode output, not a source constant, and the manifest
no longer declares `host_permissions` at all.** Deployed to Render, so the extension had to
stop pointing at `localhost`. The naive move — edit two files — sets up the worst-shaped bug
this project can ship: an extension published pointing at `localhost:3000` works perfectly on
the developer's machine and fails for every single user.

`vite.config.js` now derives the origin from the build mode (`npm run dev` → local,
`npm run build` → Render) and writes it into both places that need it: a `define` that
replaces `__API_ORIGIN__` inside `offscreen.js`, and a `closeBundle` hook that writes
`host_permissions` into `dist/manifest.json`. Neither build can be shipped wearing the other's
configuration, because neither is written by hand.

`public/manifest.json` therefore has **no** `host_permissions` key. Rejected leaving a
placeholder there: a stale-looking value that is silently overwritten is exactly the kind of
thing someone later "fixes" by editing it. With the key absent, a manifest whose generation
step failed grants no host permission at all and refuses every request — loud, and trivially
diagnosed, where a manifest quietly naming the wrong environment is neither.

Rejected listing both origins and letting one build serve both purposes. `host_permissions`
is static JSON and cannot read the mode, but the real objection is that
`http://localhost:3000/*` on a *published* extension grants it access to whatever the user
happens to be running on their own machine. That is exactly the unjustified breadth `PLAN.md`
warns reviewers reject, and it would be an awkward thing to defend for a music-identification
extension.

`verify-dist.js` gained the matching guard: it fails the build if `host_permissions` is empty,
or if it grants an origin that never appears in the built `offscreen.js`. Verified by
tampering with `dist/manifest.json` and watching the build fail. Chrome blocks a fetch to an
unlisted host *before it leaves*, and the popup renders that as "Can't reach TrackDown" — which
sends you debugging the server instead of the build. That is a full afternoon, and the check
that prevents it is fifteen lines.

**2026-08-11 — `STALE_AFTER_MS` stays at 30s; the cold-start worry does not apply.** `PLAN.md`
flagged it as tuned against a local server, on the theory that a deployed cold start could
exceed 30s by itself and surface as a spurious "That took too long". Render's Starter instance
does not spin down, so cold starts happen only on deploy, and the deployed server answers a
full identification in 0.67–1.1s — faster than local, since it now sits beside ACRCloud's US
endpoint rather than routing from a laptop. Recorded so it reads as checked rather than
forgotten. Revisit only if the instance ever drops to the Free tier, where the ~50s spin-up
would break it immediately.

---

**2026-08-14 — The icon is a crop of Owen's artwork, not the artwork.** What arrived was a
logo *presentation*: a 1024px render of a white card on a grey ground, drop shadow included,
with the mark in the middle and a "TrackDown" wordmark beneath it. Shipping it whole would
have spent most of the icon's pixels on the card and the shadow, and the wordmark — a quarter
of the height — is unreadable below about 64px, while the toolbar renders at 16. Cropped to
the circular mark alone (640×640 at offset 195,127 in the source) and downscaled with `sips`.
The first crop was three pixels too generous and caught the tops of the letters at 128px,
which is only visible if you actually look at the output — hence looking at it.

**2026-08-14 — `verify-dist.js` checks the icons too.** A missing icon is the same class of
failure as a hashed filename: nothing throws. Chrome substitutes a generated letter tile that
looks enough like an icon to ship past, and the Web Store rejects a submission missing the
128 only after you have waited for review. Six lines to turn both into a failed build.

**2026-08-14 — `debug` no longer renders; the string is not lost.** It was on screen through
1D for a real reason — the offscreen console dies with the document, so the popup was the
only place exception text was visible. That reason expired: the whole outcome object is
written to `chrome.storage.session`, `debug` included, and DevTools reads it there long
after. So this is not a tradeoff of debuggability for polish; the channel just moved. The
`message` fallback survives, but only where the popup has no copy of its own, and now renders
as ordinary detail text rather than in a monospace `<code>` that read like a leak even when
it wasn't.

**2026-08-14 — CORS is locked by env var, not by a hardcoded ID.** `ALLOWED_EXTENSION_IDS`
takes bare comma-separated IDs; unset allows all and says so at boot, which is right for
development and makes a production instance left open visible in the logs rather than silent.
Hardcoding was rejected on two grounds: the published ID does not exist until the store
issues it, so the code would have to ship with a placeholder anyway; and a dashboard edit is
revertible in seconds where a deploy is not. Multiple origins are echoed rather than listed,
because `Access-Control-Allow-Origin` takes one origin or `*` and never a set — with `Vary:
Origin` so an intermediate cache cannot hand one caller's allow header to the next.

Also corrects something asserted on 2026-08-11: locking CORS was said to break every unpacked
install. It does not. An extension page fetching a host listed in its own `host_permissions`
is not subject to CORS at all, which `server/src/index.js` already said in a comment. These
headers only ever governed curl and non-extension callers.

**2026-08-14 — The store listing declares "Website content" as data handled.** The tempting
answer is no, on the grounds that nothing is retained. That is not what the question asks:
Chrome defines the category as text, images, **sounds**, video or hyperlinks taken from a
page, and a five-second tab capture is a sound taken from a page. Retention is a separate
question, answered separately. A disclosure that contradicts a manifest requesting
`tabCapture` is exactly the mismatch that draws a rejection.

**2026-08-14 — The PDF viewer is not an unsupported surface, and never was.** `PLAN.md` had
listed it since Phase 1B alongside `chrome://` and the Web Store as a page that should refuse
with `unsupported_page`. Tested against an online PDF and the assumption is simply false:
`getMediaStreamId` succeeds, the offscreen document records, and the exactly-zero silence
check answers `no_audio` at 1.2s. A PDF is a page with no sound, which the silence tier
already handled — there was never a special case to write.

Worth noting how it presented, because it looked like a bug for a moment. `no_audio`'s detail
reads "Start the video, or unmute it, and try again", which is easy to read back as the muted
message. `mutedInfo` was logged to settle it and came back `{"muted":false}`, which ruled out
the muted guard in one round trip rather than by argument. The copy stays as it is: "start the
video" is right for YouTube, Reels and TikTok, and generalising it to suit PDFs would make the
common case worse to fix a case that is already answered correctly.
