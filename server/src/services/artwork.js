// Cover art, filled in for providers that don't return any.
//
// ACRCloud returns none, so without this the popup renders a text-only result. It hangs off
// the services/index.js seam rather than living inside acrcloud.js: filling a missing field
// is a normalization concern, and any future provider that omits artwork gets it for free.
//
// Source is the iTunes Search API — public, unauthenticated, and documented for exactly this
// kind of third-party lookup. Spotify was the original plan and is no longer possible: its
// Web API now refuses catalogue reads unless the app owner holds Premium. See DECISIONS.md.
//
// Nothing in this file may throw. A result with no artwork is the status quo; a result that
// never arrives because artwork lookup failed is a regression.

const SEARCH_URL = 'https://itunes.apple.com/search';
const TIMEOUT_MS = 5_000;

// The popup renders art at 56px CSS, so 300 covers a 3x display with room to spare. iTunes
// hands back a 100px URL and resizes by path segment, so this costs nothing but a string.
const TARGET_PX = 300;

// Enough candidates to get past a compilation or a karaoke cover sitting at position one,
// few enough that a wrong answer can't hide deep in the list.
const CANDIDATES = 5;

// Artwork URLs don't change, so this only ever saves work. Capped because the process is
// long-lived and the key space is every song anyone identifies.
const MAX_CACHE = 500;
const cache = new Map();

/**
 * Fills `albumArt` when the provider left it null. Returns the result either way.
 */
export async function withArtwork(result) {
  if (!result?.found || result.albumArt) return result;
  if (!result.title || !result.artist) return result;

  const albumArt = await lookupArtwork(result.title, result.artist);
  return albumArt ? { ...result, albumArt } : result;
}

async function lookupArtwork(title, artist) {
  const key = `${normalize(title)}|${normalize(artist)}`;
  if (cache.has(key)) return cache.get(key);

  let url;
  try {
    url = await search(title, artist);
  } catch (err) {
    // Transient — a timeout, a throttle, a bad gateway. Deliberately not cached, so the next
    // request for this track tries again rather than inheriting a network blip forever.
    console.error(`[artwork] "${title}" — ${artist}: ${err.message}`);
    return null;
  }

  remember(key, url);
  return url;
}

function remember(key, url) {
  // Oldest-out. Map iterates in insertion order, so the first key is the oldest.
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, url);
}

async function search(title, artist) {
  const query = new URLSearchParams({
    term: `${title} ${artist}`,
    entity: 'song',
    limit: String(CANDIDATES),
  });

  const response = await fetch(`${SEARCH_URL}?${query}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`search returned ${response.status}`);

  // iTunes answers with Content-Type: text/javascript, so response.json() is not guaranteed
  // to be willing. Parse the text ourselves rather than depend on the header.
  const body = JSON.parse(await response.text());
  return pickArtwork(body?.results, title, artist);
}

// Both title AND artist have to match, and a miss returns null rather than a best guess.
//
// A search for a common title otherwise lands on a karaoke version or a tribute band — the
// title matches perfectly and the artwork is for a different record entirely. Wrong cover art
// is worse than none here: the result is already hedged as a "best match" because provider
// metadata can be wrong, and confidently pairing it with the wrong picture compounds exactly
// the error the hedge exists to warn about.
function pickArtwork(results, title, artist) {
  if (!Array.isArray(results)) return null;

  const wantTitle = normalize(title);
  const wantArtist = normalize(artist);

  const match = results.find(
    (candidate) =>
      similar(normalize(candidate?.trackName), wantTitle) &&
      similar(normalize(candidate?.artistName), wantArtist),
  );

  return match?.artworkUrl100 ? resize(match.artworkUrl100) : null;
}

// Substring either way, not equality. Providers disagree on the edges of the same name —
// ACRCloud said "League of Legends" where iTunes says "League of Legends Music" — and an
// exact comparison rejects the correct answer over a suffix.
function similar(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function normalize(value) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // drop diacritics; "Beyoncé" and "Beyonce" are one artist
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // "(feat. …)", "[Remastered]" — noise, not identity
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// iTunes encodes the size in the path, so any dimension is a string replacement away.
// Falls back to the URL as given rather than to null: a 100px cover still beats no cover.
function resize(url) {
  return url.replace(/\/\d+x\d+bb\.jpg$/, `/${TARGET_PX}x${TARGET_PX}bb.jpg`);
}
