// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function extractReleases() {
  const js = fs.readFileSync(path.join(ROOT, 'assets', 'releases-data.js'), 'utf-8');
  const m = js.match(/const RELEASES = (\{.*\});/);
  expect(m, 'RELEASES literal must be found in assets/releases-data.js').not.toBeNull();
  return JSON.parse(m[1]);
}

test.describe('Data integrity (no browser) @bat', () => {
  test('RELEASES JSON in assets/releases-data.js parses without error', () => {
    // Guards against the backslash-escape corruption bug from re.sub with a
    // plain-string replacement (see project memory) — a syntax error here
    // silently kills the entire inline <script>, breaking the whole page.
    expect(() => extractReleases()).not.toThrow();
  });

  test('every release has the required fields with correct types', () => {
    const releases = extractReleases();
    const slugs = Object.keys(releases);
    expect(slugs.length).toBeGreaterThanOrEqual(60);

    for (const slug of slugs) {
      const r = releases[slug];
      expect(typeof r.artist, `${slug}.artist`).toBe('string');
      expect(typeof r.title, `${slug}.title`).toBe('string');
      expect(r.artist.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.date, `${slug}.date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['single', 'ep', ''], `${slug}.suffix`).toContain(r.suffix);
      expect(Array.isArray(r.tracks), `${slug}.tracks`).toBe(true);
      expect(r.tracks.length).toBeGreaterThan(0);
      if (r.video !== undefined) {
        const videos = typeof r.video === 'string' ? [r.video] : Object.values(r.video);
        for (const v of videos) {
          expect(v, `${slug}.video`).toMatch(/^https:\/\/(www\.)?(youtu\.be|youtube\.com)\//);
        }
      }
      if (r.streaming !== undefined) {
        expect(typeof r.streaming, `${slug}.streaming`).toBe('object');
        for (const [service, url] of Object.entries(r.streaming)) {
          expect(typeof url, `${slug}.streaming.${service}`).toBe('string');
          expect(url.startsWith('https://'), `${slug}.streaming.${service} should be https`).toBe(true);
        }
      }
    }
  });

  test('no duplicate slugs and no duplicate (artist, title) pairs', () => {
    const releases = extractReleases();
    const pairs = new Set();
    for (const [slug, r] of Object.entries(releases)) {
      const key = `${r.artist}|${r.title}`;
      expect(pairs.has(key), `duplicate release: ${key} (slug ${slug})`).toBe(false);
      pairs.add(key);
    }
  });

  test('sfNumber (catalog numbering, by join-date not release-date) is a complete 1..N permutation', () => {
    const releases = extractReleases();
    const slugs = Object.keys(releases);
    const numbers = slugs.map((slug) => releases[slug].sfNumber);
    expect(numbers.every((n) => typeof n === 'number'), 'every release must have a numeric sfNumber').toBe(true);
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: slugs.length }, (_, i) => i + 1));
  });

  test('every release has a cover image file on disk', () => {
    const releases = extractReleases();
    const missing = [];
    for (const slug of Object.keys(releases)) {
      const coverPath = path.join(ROOT, 'assets', 'covers', `${slug}.webp`);
      if (!fs.existsSync(coverPath)) missing.push(slug);
    }
    expect(missing, `missing cover files for: ${missing.join(', ')}`).toEqual([]);
  });

  test('catalog-item grid cards in catalogo.html match RELEASES 1:1', () => {
    const releases = extractReleases();
    const html = fs.readFileSync(path.join(ROOT, 'catalogo.html'), 'utf-8');
    // Scoped to real grid cards only — a JS template string elsewhere in the
    // file (building bio-link spans) also contains a literal `data-slug="`
    // substring and would otherwise false-positive as an extra card.
    const gridSlugs = [...html.matchAll(/<a class="catalog-item" data-slug="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(gridSlugs).size).toBe(gridSlugs.length); // no duplicate cards
    expect(gridSlugs.sort()).toEqual(Object.keys(releases).sort());
  });

  test('videoclips.html cards only reference releases that actually have a video field', () => {
    const releases = extractReleases();
    const html = fs.readFileSync(path.join(ROOT, 'videoclips.html'), 'utf-8');
    const ids = [...html.matchAll(/data-yt="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);

    const allVideoIds = [];
    for (const r of Object.values(releases)) {
      if (!r.video) continue;
      const urls = typeof r.video === 'string' ? [r.video] : Object.values(r.video);
      for (const u of urls) {
        const m = u.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
        if (m) allVideoIds.push(m[1]);
      }
    }
    for (const id of ids) {
      expect(allVideoIds, `video id ${id} on videoclips.html has no matching release.video entry`).toContain(id);
    }
  });

  test('every HTML page references the same style.css version', () => {
    const pages = ['index.html', 'catalogo.html', 'nosotros.html', 'videoclips.html', 'eventos.html'];
    const versions = pages.map((p) => {
      const html = fs.readFileSync(path.join(ROOT, p), 'utf-8');
      const m = html.match(/style\.css\?v=(\d+)/);
      expect(m, `${p} should link style.css with a version query`).not.toBeNull();
      return m[1];
    });
    expect(new Set(versions).size, `inconsistent CSS versions across pages: ${versions.join(', ')}`).toBe(1);
  });

  // Artistas was folded into Catálogo's own tabbed panel — the nav is back to
  // omitting the current page (5 real pages total) rather than showing all of
  // them with one marked active, since 6 visible links read as too many.
  test('every page nav lists the other 4 pages, omitting itself and Artistas entirely', () => {
    const ALL_PAGES = ['index.html', 'catalogo.html', 'videoclips.html', 'eventos.html', 'nosotros.html'];
    for (const page of ALL_PAGES) {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf-8');
      const navMatch = html.match(/<nav class="nav-links"[^>]*>([\s\S]*?)<\/nav>/);
      expect(navMatch, `${page} should have a nav-links block`).not.toBeNull();
      const hrefs = [...navMatch[1].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs, `${page} nav links, in order`).toEqual(ALL_PAGES.filter((p) => p !== page));
      expect(hrefs, `${page} nav should never link to artistas.html`).not.toContain('artistas.html');
    }
  });

  test('artistas.html redirects to catalogo.html#artistas rather than 404ing old links', () => {
    const html = fs.readFileSync(path.join(ROOT, 'artistas.html'), 'utf-8');
    expect(html).toMatch(/url=catalogo\.html#artistas/);
  });

  test('segunda-fundacion.html redirects to index.html rather than 404ing old links', () => {
    const html = fs.readFileSync(path.join(ROOT, 'segunda-fundacion.html'), 'utf-8');
    expect(html).toMatch(/url=index\.html/);
  });
});
