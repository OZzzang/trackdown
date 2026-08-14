# TrackDown — Privacy Policy

**Last updated: 14 August 2026**

TrackDown is a Chrome extension that identifies the song playing in a browser tab. This
policy describes exactly what it captures, where that goes, and what is kept.

The short version: TrackDown records five seconds of audio when you click its icon, sends it
away to be identified, and keeps none of it. There are no accounts, no tracking, and no
advertising.

---

## What is captured

**Five seconds of audio from the tab you are looking at, and only when you click the
TrackDown icon.**

There is no background listening. The extension has no way to record anything until you
click, and it stops on its own after five seconds. Chrome shows its own recording indicator
on the tab for the whole time, which TrackDown cannot suppress.

TrackDown captures **tab audio, not microphone audio**. It never requests microphone access,
and cannot hear anything in the room. If the tab is silent or muted, the capture is discarded
without leaving your computer.

Nothing else on the page is read — not the page contents, not its address, not your browsing
history, not form data, not cookies.

## Where it goes

1. The clip is sent over HTTPS to the TrackDown server at `trackdown-wcvk.onrender.com`.
2. The server forwards it to **ACRCloud**, an audio-fingerprinting service, which matches it
   against a music catalogue and returns the song's details.
3. If a song is found, the server looks up its cover art from the **Apple iTunes Search API**.
   Only the matched **song title and artist name** are sent to Apple — never your audio.
4. The song details are returned to the extension and shown in the popup.

Those two providers handle data under their own policies:

- ACRCloud — <https://www.acrcloud.com/privacy-policy/>
- Apple — <https://www.apple.com/legal/privacy/>

## What is kept

**The audio is never stored.** It is held in the server's memory for the second or so the
request takes, forwarded, and discarded. It is never written to disk, never placed in a
database, and never retained after the request finishes.

**TrackDown keeps no database of any kind today.** Identifications are not recorded, and
there is no user account to attach them to.

Two things do exist, and it is worth being precise about them:

- **Abuse limits.** To stop the service being drained by automated traffic, the server counts
  recent requests per network address. These counters live in memory, are not written down,
  and disappear when the server restarts or the time window elapses. They are never used to
  build a profile.
- **Hosting logs.** The server is hosted on Render, which — like any web host — records basic
  request logs that can include IP addresses. These are operational records held by the host,
  not something TrackDown reads or analyses.

## What stays on your computer

The most recent capture result is held in `chrome.storage.session`, which is what lets the
popup show your result if you close and reopen it mid-search. Chrome clears this
automatically when you quit the browser. It never leaves your machine.

## Permissions, and why each one exists

| Permission | Why |
|---|---|
| `tabCapture` | To record the five seconds of audio. This is the core function. |
| `offscreen` | Chrome only permits audio recording in an offscreen document, so one is created for the duration of the capture and closed afterwards. |
| `storage` | To hold the in-progress state and the last result, as described above. |
| `activeTab` | To know which tab to record — the one in front of you when you click. |

TrackDown does **not** request access to your browsing history, your bookmarks, your data on
websites, or `<all_urls>`.

## What TrackDown does not do

- No advertising, and no data sold or shared with advertisers or data brokers.
- No analytics or telemetry of any kind.
- No tracking across sites, and no profile of you or your listening.
- No account, no sign-in, no email address collected.
- No microphone access, ever.

## Children

TrackDown is not directed at children under 13 and knowingly collects no information from
them. Since it collects no personal information from anyone, there is nothing to delete.

## Your data, and removing it

Because no identifying information is stored, there is no account to close and no data to
request or erase. To stop TrackDown entirely, remove it at `chrome://extensions` — that
deletes the local state along with it.

## Changes

If this policy changes in a way that affects what is captured or kept, the date at the top
will be updated and the change described here. A future version of TrackDown plans to add an
optional history of your identifications; if that ships, this policy will be revised **before**
it does, and the history will be under your control with a way to clear it.

## Contact

Questions about this policy: **owenzeng315@gmail.com**
