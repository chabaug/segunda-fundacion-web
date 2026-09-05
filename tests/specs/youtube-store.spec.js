// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

// youtube-store.mts is real ESM+TypeScript (Netlify Functions format), not
// requireable from this CommonJS spec — Node 22+'s built-in type-stripping
// lets a plain dynamic import() load it directly with zero build step, as
// long as the path goes through pathToFileURL first (a raw Windows path
// like "E:\...\foo.mts" is not a valid module specifier on its own). Same
// pattern as releases-store.spec.js.
const STORE_PATH = path.resolve(__dirname, '..', '..', 'netlify', 'lib', 'youtube-store.mts');
const loadStore = () => import(pathToFileURL(STORE_PATH).href);

// Deliberately exercises only the pure functions (parseIsoDurationSeconds,
// pickHomepageVideo) — loadHomepageVideo()/saveHomepageVideo() hit real
// Netlify Blobs, and the actual YouTube API calls in youtube-sweep.mts
// (getUploadsPlaylistId, getRecentUploads, attachDurations) aren't covered
// at all yet since that would need a live netlify dev process plus a real
// or mocked YouTube API key — same gap the project accepts for the
// Blobs-touching half of releases-store.mts.
test.describe('youtube-store.mts pure logic @bat', () => {
  test('parseIsoDurationSeconds: parses hours/minutes/seconds in any combination', async () => {
    const { parseIsoDurationSeconds } = await loadStore();
    expect(parseIsoDurationSeconds('PT45S')).toBe(45);
    expect(parseIsoDurationSeconds('PT1M30S')).toBe(90);
    expect(parseIsoDurationSeconds('PT1H2M10S')).toBe(3730);
    expect(parseIsoDurationSeconds('PT4M')).toBe(240);
    expect(parseIsoDurationSeconds('PT0S')).toBe(0);
  });

  test('parseIsoDurationSeconds: garbage input is treated as zero, not thrown on', async () => {
    const { parseIsoDurationSeconds } = await loadStore();
    expect(parseIsoDurationSeconds('')).toBe(0);
    expect(parseIsoDurationSeconds('not-a-duration')).toBe(0);
  });

  test('pickHomepageVideo: filters out Shorts (<=60s), keeps longer uploads', async () => {
    const { pickHomepageVideo } = await loadStore();
    const short = { videoId: 'short1', title: 'A Short', publishedAt: '2026-06-01T00:00:00Z', durationSeconds: 45 };
    const exactlySixty = { videoId: 'edge1', title: 'Exactly 60s', publishedAt: '2026-06-02T00:00:00Z', durationSeconds: 60 };
    const longForm = { videoId: 'long1', title: 'A Real Video', publishedAt: '2026-06-03T00:00:00Z', durationSeconds: 200 };

    const pick = pickHomepageVideo([short, exactlySixty, longForm], { videoId: 'old' });
    expect(pick.videoId).toBe('long1');

    // Nothing eligible (only Shorts, and the 60s boundary is exclusive) -> null.
    expect(pickHomepageVideo([short, exactlySixty], { videoId: 'old' })).toBeNull();
  });

  test('pickHomepageVideo: picks the newest by publishedAt, not list order', async () => {
    const { pickHomepageVideo } = await loadStore();
    const older = { videoId: 'v-older', title: 'Older', publishedAt: '2026-01-01T00:00:00Z', durationSeconds: 120 };
    const newer = { videoId: 'v-newer', title: 'Newer', publishedAt: '2026-06-01T00:00:00Z', durationSeconds: 120 };

    // Deliberately listed oldest-first to prove sorting isn't just "take index 0".
    const pick = pickHomepageVideo([older, newer], { videoId: 'old' });
    expect(pick.videoId).toBe('v-newer');
  });

  test('pickHomepageVideo: returns null when the pick is already the current video (no-op)', async () => {
    const { pickHomepageVideo } = await loadStore();
    const current = { videoId: 'already-live', title: 'Already Live', publishedAt: '2026-06-01T00:00:00Z', durationSeconds: 200 };
    expect(pickHomepageVideo([current], { videoId: 'already-live' })).toBeNull();
  });

  test('pickHomepageVideo: publishedAt in the result is truncated to a plain date', async () => {
    const { pickHomepageVideo } = await loadStore();
    const candidate = { videoId: 'v1', title: 'T', publishedAt: '2026-06-15T13:45:00Z', durationSeconds: 200 };
    const pick = pickHomepageVideo([candidate], { videoId: 'old' });
    expect(pick.publishedAt).toBe('2026-06-15');
    expect(pick).not.toHaveProperty('durationSeconds');
    expect(pick).not.toHaveProperty('updatedAt');
  });
});
