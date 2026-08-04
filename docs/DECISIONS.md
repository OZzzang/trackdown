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
`offscreen.html` the same way in 1B. Vite's default `[name].[hash].js` breaks both without
throwing: the extension still loads and the worker simply never runs, which reads as "my code
does nothing" rather than as a build error.

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
Node has read `.env` natively since 20.12, so the dependency buys nothing. The
`-if-exists` variant matters specifically for deployment: Railway and Render inject env vars
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
