# Chrome Web Store submission pack

Everything the listing form asks for, written out so submission is copy-paste rather than
composition. Fields are in roughly the order the dashboard presents them.

The form requires a publicly reachable privacy policy URL and validates that it loads. That
is already satisfied: the repo is public, so `PRIVACY.md` is served at
<https://github.com/OZzzang/trackdown/blob/main/docs/PRIVACY.md>. Nothing to host, and the
policy stays next to the code it describes with a public history of every change to it.

---

## Store listing

**Name** (45 char limit)

```
TrackDown
```

**Short description** (132 char limit — this is the line shown in search results)

```
Identify the background song playing in any browser tab. One click, five seconds, and you have the track.
```

**Category:** Tools
**Language:** English (United States)

**Detailed description**

```
Ever hear a song in a YouTube vlog, a TikTok, or an Instagram Reel and have no idea what it
is? TrackDown tells you — without reaching for your phone.

Click the TrackDown icon while the audio is playing. It listens to the tab for five seconds,
matches it against a catalogue of millions of tracks, and shows you the title, the artist,
and the cover art.

HOW IT WORKS

1. Play the video or track you want identified.
2. Click the TrackDown icon.
3. Wait five seconds.

That's it. No account, no sign-up, nothing to configure.

WHY IT'S DIFFERENT

Holding your phone up to your laptop speakers works badly, and it fails completely when
someone is talking over the music — which, on social video, is most of the time. TrackDown
takes the audio straight from the tab, so there is no room noise, no speaker distortion, and
nothing lost between your screen and a microphone.

It also keeps working when your volume is down: TrackDown reads the tab's audio directly
rather than listening to the room.

BUILT TO BE HONEST

Song identification is not a certainty, and TrackDown does not pretend otherwise. Results are
shown as a best match, because fingerprinting services can match audio correctly and still
report a mislabeled title from a bad catalogue entry. Live versions, covers and remixes often
are not in the database at all — TrackDown says so plainly instead of guessing.

The same goes for cover art. If the artwork lookup cannot confirm both the title and the
artist, you get the result without an image rather than an album cover belonging to someone
else's record.

PRIVACY

TrackDown records only when you click, only ever five seconds, and only the tab's audio.

It cannot use your microphone, and never asks for it. It does not read the page, your
browsing history, or anything you type. The audio clip is used to identify the song and is
never stored — not on disk, not in a database, not after the request finishes.

There are no accounts, no analytics, no tracking, and no advertising.

Full policy: https://github.com/OZzzang/trackdown/blob/main/docs/PRIVACY.md

KNOWN LIMITS

- Chrome does not allow any extension to capture audio on chrome:// pages, the Chrome Web
  Store, or the built-in PDF viewer.
- A muted or paused tab produces no audio to identify. TrackDown tells you rather than
  failing silently.
- Speech over music works, but heavy talking over quiet background music is the hardest case
  for any fingerprinting service.
```

> The policy URL above is live — the repo is public, so `docs/PRIVACY.md` serves itself.
> Paste the same URL into the form's own privacy policy field.

---

## Single purpose

The dashboard requires one sentence. Breadth is what gets rejected here, so this is
deliberately narrow.

```
TrackDown captures a short sample of audio from the tab the user is viewing, at the user's
explicit request, in order to identify the song playing in it.
```

---

## Permission justifications

One box per permission. Reviewers reject vague answers, so each states the mechanism, not the
benefit.

**`tabCapture`**

```
This is the extension's core function. When the user clicks the toolbar icon, TrackDown
captures five seconds of audio from the active tab and sends it to an audio-fingerprinting
service to identify the song. Capture is never initiated without a click and always stops
after five seconds.
```

**`offscreen`**

```
Chrome permits MediaRecorder and getUserMedia only in a document with a DOM, and a Manifest
V3 service worker has none. TrackDown creates an offscreen document for the duration of the
capture, which is the only supported way to record audio in Manifest V3, and closes it as
soon as the recording is finished.
```

**`storage`**

```
Used with chrome.storage.session to hold the state of an in-progress capture and its result,
so that the popup can render correctly if the user closes and reopens it while a capture is
running. Chrome clears session storage when the browser closes. No browsing data is stored.
```

**`activeTab`**

```
Used to determine which tab to record — the one the user is viewing when they click the
icon — and to check whether that tab is muted before attempting a capture. TrackDown does not
read page content, URLs, or history.
```

**Host permission** (`https://trackdown-wcvk.onrender.com/*`)

```
The audio clip is sent to this server, which holds the fingerprinting provider's API
credential. The credential cannot be shipped in the extension because extension source is
publicly readable. This is the only host TrackDown contacts, and the extension requests no
access to any website.
```

**Remote code**

```
No. All code is included in the extension package. No scripts are fetched or evaluated at
runtime.
```

---

## Data usage disclosures

Answer the checklist as follows. The first one is the easy mistake to get wrong.

| Category | Answer |
|---|---|
| Personally identifiable information | **No** |
| Health information | **No** |
| Financial and payment information | **No** |
| Authentication information | **No** |
| Personal communications | **No** |
| Location | **No** |
| Web history | **No** |
| User activity | **No** |
| **Website content** | **YES** |

**Website content must be declared.** Chrome defines the category as text, images, **sounds**,
video, or hyperlinks taken from a page — and tab audio is a sound taken from a page. Ticking
"no" here because nothing is *retained* is the kind of mismatch that gets a submission
rejected, and it is not what the question asks. What it asks is whether the extension
*handles* it, which TrackDown plainly does.

If a free-text explanation is offered:

```
TrackDown transmits a five-second audio sample from the active tab to its own server, which
forwards it to a fingerprinting provider for song identification. The audio is held in memory
for the duration of the request and is never stored.
```

**Certifications** — all three can be truthfully accepted:

- *Not selling or transferring user data to third parties outside approved use cases.* The
  clip goes to the fingerprinting provider solely to perform the function the user asked for,
  which is the "necessary to provide the requested service" case.
- *Not using or transferring data for purposes unrelated to the single purpose.*
- *Not using or transferring data to determine creditworthiness or for lending.*

---

## Graphic assets

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | **Done** — `extension/public/icons/icon-128.png` |
| Screenshot | 1280×800 PNG | **Needed** — at least one, up to five |
| Small promo tile | 440×280 PNG | Optional |
| Marquee promo tile | 1400×560 PNG | Optional |

Screenshots are what actually sell the listing, and one is enough to submit. Worth capturing,
in order of value:

1. **A successful result** — popup open over a playing YouTube video, cover art visible. This
   is the whole product in one image, and it is why the screenshot had to wait for artwork.
2. The five-second progress bar mid-capture, showing what the wait looks like.
3. A refusal — "This tab isn't playing anything" — which demonstrates the error handling is
   considered rather than absent.

The popup is 320px wide, so a raw capture will not fill 1280×800. Compose it over a
screenshot of the page it was taken on rather than upscaling it.

---

## Before submitting

- [x] ~~Host `PRIVACY.md`.~~ Public repo, so it is already served at its GitHub URL.
      Still needs pasting into the form's privacy policy field.
- [ ] Decide the version number. `manifest.json` says `0.1.0`; a public launch usually reads
      as `1.0.0`. The store only requires that it increase on each update.
- [ ] `npm run build` from `extension/`, then zip **`extension/dist/`** — the build output,
      not the source directory.
- [ ] Confirm the zipped manifest points at the production origin, not `localhost`.

## After the ID is issued

Publishing assigns a permanent extension ID. One thing is waiting on it:

- Set `ALLOWED_EXTENSION_IDS` to that ID in the Render dashboard, which locks CORS to the
  published extension. This is a dashboard edit, not a deploy, and reverting is the same edit.
  Note it is belt-and-braces rather than load-bearing — an extension page fetching a host in
  its own `host_permissions` is not subject to CORS in the first place, so this governs
  non-extension callers.
