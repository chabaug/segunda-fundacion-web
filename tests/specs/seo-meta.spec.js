// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES = ['index.html', 'catalogo.html', 'videoclips.html', 'eventos.html', 'nosotros.html'];

function head(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf-8');
  const m = html.match(/<head>([\s\S]*?)<\/head>/);
  expect(m, `${page} should have a <head> block`).not.toBeNull();
  return m[1];
}

test.describe('SEO / metadata (no browser) @bat', () => {
  test('every page declares html lang="es"', () => {
    for (const page of PAGES) {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf-8');
      expect(html, page).toMatch(/<html lang="es">/);
    }
  });

  test('every page has a non-empty <title>, unique across the site', () => {
    const titles = PAGES.map((page) => {
      const m = head(page).match(/<title>([^<]+)<\/title>/);
      expect(m, `${page} should have a <title>`).not.toBeNull();
      const title = m[1].trim();
      expect(title.length, `${page} title`).toBeGreaterThan(0);
      expect(title, `${page} title should name the label`).toContain('Segunda Fundación');
      return title;
    });
    expect(new Set(titles).size, `titles should be unique across pages: ${titles.join(' | ')}`).toBe(titles.length);
  });

  test('every page has a meta description of reasonable length', () => {
    for (const page of PAGES) {
      const m = head(page).match(/<meta name="description" content="([^"]+)">/);
      expect(m, `${page} should have a meta description`).not.toBeNull();
      const desc = m[1];
      expect(desc.length, `${page} description length`).toBeGreaterThan(10);
      expect(desc.length, `${page} description should stay reasonably short for search snippets`).toBeLessThan(300);
    }
  });

  test('every page declares a responsive viewport meta tag', () => {
    for (const page of PAGES) {
      expect(head(page), page).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
    }
  });

  test('every page links a favicon', () => {
    for (const page of PAGES) {
      expect(head(page), page).toMatch(/<link rel="icon"/);
    }
  });
});
