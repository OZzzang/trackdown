# Decisions

One entry per non-obvious call. Takes ~20 seconds to write and saves reconstructing your own
reasoning in an interview six months later.

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

**Pending — Phase 0 result.** Does AudD accept `webm/opus` without transcoding? What clip
length works? What's the hit rate with speech over the music? Record here before Phase 1A.
