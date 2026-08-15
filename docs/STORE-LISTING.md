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

**Summary / short description** — **not typed into the form.** The dashboard shows this as
"Summary from package" and it is read-only: it comes from `description` in `manifest.json`,
so changing it means editing the manifest, rebuilding, and uploading a new package. Limit is
132 characters; ours is 114.

```
Identify music playing in a browser tab. Click once, TrackDown listens for five seconds and searches for a match.
```

**Rewritten 2026-08-15 after the "Inaccurate Description" rejection.** The previous summary
read "Identify the background song playing in any browser tab" — and the reviewer quoted
`"Identify the background song"` back as the functionality they could not reproduce. Two
separate overclaims in one sentence: *background* song is the single hardest case for any
fingerprinting service, and *any* browser tab is false, since Chrome blocks capture on
`chrome://` pages and the Web Store. The replacement promises a search, not a result.

**Category:** Entertainment

Chosen over a general utility category deliberately. The primary function is identifying
music, and Chrome asks you to categorize by function rather than by mechanism — but the
practical reason is discovery: the utility bucket is the largest on the store and a new
listing vanishes into it, while Entertainment puts TrackDown beside the media extensions its
audience already runs. Note Google has reshuffled these categories, so the dropdown may offer
"Functionality & UI" where older docs say "Tools"; take whatever it actually lists.

**Language:** English (United States)

**Detailed description**

```
TrackDown identifies music playing in a browser tab. Click the icon while a song is audible,
and it listens for five seconds, then searches an audio-fingerprinting catalogue for a match.

HOW TO USE IT

1. Play a video or track with music that is currently audible.
2. Click the TrackDown icon.
3. Wait five seconds for the result.

No account, no sign-up, nothing to configure.

WHAT IT DOES WELL

TrackDown reads audio directly from the tab instead of through a microphone, so nothing is
lost to room noise or speaker distortion between the source and the match. Studio recordings
— music videos, official uploads, radio streams, playlists — are what audio fingerprinting
handles best, and they are what TrackDown is built for.

WHAT IT WILL NOT ALWAYS DO

Audio fingerprinting is a catalogue lookup, not a guarantee, and TrackDown does not pretend
otherwise:

- Live versions, covers, remixes and DJ edits are frequently not in the catalogue at all, and
  will come back with no match.
- Quiet background music underneath speech is the hardest case for any fingerprinting
  service, and will sometimes come back with no match.
- Results are shown as a best match. Fingerprinting services can match audio correctly and
  still report a mislabeled title from a bad catalogue entry.
- Cover art is shown when it can be confirmed against both the title and the artist.
  Otherwise you get the result without an image, rather than a stranger's album cover.

WHERE IT CANNOT LISTEN

Chrome does not allow any extension to capture audio on chrome:// pages or on the Chrome Web
Store. A muted or paused tab produces no audio to identify, and TrackDown says so plainly
rather than failing silently.

PRIVACY

TrackDown records only when you click, only ever five seconds, and only the tab's audio.

It cannot use your microphone, and never asks for it. It does not read the page, your
browsing history, or anything you type. The audio clip is used to identify the song and is
never stored — not on disk, not in a database, not after the request finishes.

There are no accounts, no analytics, no tracking, and no advertising.

Full policy: https://github.com/OZzzang/trackdown/blob/main/docs/PRIVACY.md
```

**Rewritten 2026-08-15**, same rejection. What changed and why each mattered:

- **The opening no longer sells the hardest case.** It led with "a song in a YouTube vlog, a
  TikTok, or an Instagram Reel" — quiet background music under speech, which the old copy
  then admitted at the bottom was the hardest case for any fingerprinting service. The
  listing promised in paragraph one what it disclaimed in the last line.
- **"shows you the title, the artist, and the cover art"** promised artwork unconditionally.
  Artwork resolves for most official releases and a minority come back bare, by design —
  `services/artwork.js` declines a near-miss rather than guessing.
- **"a catalogue of millions of tracks"** is a number we cannot substantiate; it is the
  provider's claim, not ours.
- **"It also keeps working when your volume is down"** was outright false as written. Turning
  the *speakers* down is fine, but a **muted tab** is refused up front — and "volume down" is
  exactly how a user would describe muting a tab.
- **The PDF viewer was removed from the limits.** It was never a real limitation: 2026-08-14
  testing found Chrome captures it fine (`docs/DECISIONS.md`). Claiming a restriction that
  does not exist is an inaccurate description too, just in the harmless direction.
- **Limits moved up, above privacy**, and given a heading of their own. A reviewer who reads
  only the first screen now sees what a no-match means before they see it happen.

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
| Screenshots ×3 | 1280×800 PNG | **Done** — `docs/store-assets/`, upload in filename order |
| Small promo tile | 440×280 PNG | Skipped — only affects featured placement |
| Marquee promo tile | 1400×560 PNG | Skipped — same |

The three screenshots are kept in the repo rather than only in the listing, because the
listing is not a place you can read them back out of, and regenerating them means recreating
the exact browser state as well as the crop. `screenshot-1-result.png` is also the README's
hero image.

Shots 2 and 3 are the popup padded onto a dark canvas at **native resolution rather than
upscaled** — they were captured as ~640×340 crops, which is a 2× Retina rendering of a 320px
popup, so scaling them to 1280 wide would have doubled them again and visibly softened the
text. Shot 1 is a full browser window cropped to 16:10.

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
