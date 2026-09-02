// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES = ['index.html', 'catalogo.html', 'videoclips.html', 'eventos.html', 'nosotros.html'];

function extractArtists() {
  const js = fs.readFileSync(path.join(ROOT, 'assets', 'artists-data.js'), 'utf-8');
  const m = js.match(/const ARTISTS = (\[.*\]);/s);
  expect(m, 'ARTISTS literal must be found in assets/artists-data.js').not.toBeNull();
  return JSON.parse(m[1]);
}

function extractPastEvents() {
  const jsonPath = path.join(ROOT, 'assets', 'flyers', '_events.json');
  expect(fs.existsSync(jsonPath), 'assets/flyers/_events.json should exist').toBe(true);
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

test.describe('Assets and internal links integrity (no browser) @bat', () => {
  test('every artist with hasPhoto:true has a real photo file on disk', () => {
    const artists = extractArtists();
    const missing = artists
      .filter((a) => a.hasPhoto)
      .filter((a) => !fs.existsSync(path.join(ROOT, 'assets', 'artists', `${a.slug}.webp`)))
      .map((a) => a.slug);
    expect(missing, `missing artist photos for: ${missing.join(', ')}`).toEqual([]);
  });

  test('every confirmed artist Spotify URL points at an artist profile', () => {
    const artists = extractArtists();
    for (const a of artists) {
      if (!a.spotify) continue;
      expect(a.spotify, `${a.slug}.spotify`).toMatch(/^https:\/\/open\.spotify\.com\/artist\//);
    }
  });

  test('every confirmed Instagram field is a bare handle, not a full URL', () => {
    // The site builds the link as https://instagram.com/<handle> itself
    // (see artistModalInstagram wiring) — a pasted full URL here would
    // silently produce a broken https://instagram.com/https://... link.
    const artists = extractArtists();
    for (const a of artists) {
      if (!a.instagram) continue;
      expect(a.instagram, `${a.slug}.instagram`).toMatch(/^[A-Za-z0-9_.]+$/);
    }
  });

  test('every past-show flyer file referenced in _events.json exists on disk', () => {
    const events = extractPastEvents();
    expect(events.length).toBeGreaterThan(0);
    const missing = events
      .filter((e) => !fs.existsSync(path.join(ROOT, 'assets', 'flyers', e.flyer_file)))
      .map((e) => e.slug);
    expect(missing, `missing flyer files for: ${missing.join(', ')}`).toEqual([]);
  });

  test('every past-show entry has a real name and a well-formed date', () => {
    const events = extractPastEvents();
    for (const e of events) {
      expect(typeof e.name, `${e.slug}.name`).toBe('string');
      expect(e.name.length, `${e.slug}.name`).toBeGreaterThan(0);
      // Some dates carry a trailing note like "2025-05-05 (aproximada)" — the
      // page itself only reads the first 10 chars (see eventos.html's
      // ev.date.slice(0,10)), so just guard that prefix stays parseable.
      expect(e.date, `${e.slug}.date`).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  test('release streaming links use the domain that matches their own service key', () => {
    // Guards against a copy-paste mistake (e.g. a Spotify link pasted under
    // the "tidal" key) that data-integrity's generic https-only check would miss.
    const js = fs.readFileSync(path.join(ROOT, 'assets', 'releases-data.js'), 'utf-8');
    const m = js.match(/const RELEASES = (\{.*\});/);
    const releases = JSON.parse(m[1]);
    const DOMAIN = {
      spotify: /^https:\/\/open\.spotify\.com\//,
      youtube: /^https:\/\/(music\.youtube\.com\/|(www\.)?youtube\.com\/|youtu\.be\/)/,
      tidal: /^https:\/\/([a-z0-9-]+\.)?tidal\.com\//,
      apple: /^https:\/\/music\.apple\.com\//,
      deezer: /^https:\/\/(www\.)?deezer\.com\//,
      bandcamp: /^https:\/\/[a-z0-9-]+\.bandcamp\.com\//,
    };
    for (const [slug, r] of Object.entries(releases)) {
      if (!r.streaming) continue;
      for (const [service, url] of Object.entries(r.streaming)) {
        if (!DOMAIN[service]) continue; // unknown service key, not this test's concern
        expect(url, `${slug}.streaming.${service} should point at ${service}'s own domain`).toMatch(DOMAIN[service]);
      }
    }
  });
});

test.describe('Internal navigation — no broken links or console errors, on every page', () => {
  for (const page_ of PAGES) {
    test(`${page_}: nav links all resolve 200 and the page loads with no JS errors`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto('/' + page_);

      const hrefs = await page.locator('.nav-links a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        const res = await page.request.get('/' + href);
        expect(res.status(), `${page_} -> ${href}`).toBe(200);
      }

      expect(errors, `uncaught JS errors on ${page_}:\n${errors.join('\n')}`).toEqual([]);
    });
  }
});
