// @ts-check
const { test, expect } = require('@playwright/test');

// admin/catalogo.html talks to /api/releases and /api/artists (no netlify
// dev running in this test harness) -- every test mocks those routes with
// page.route(), same convention as eventos.spec.js uses for /api/events.
// This covers the UI logic (gating, badge computation, the new-artist
// hint, tab switching, payload building) in isolation from the real
// backend, which is covered separately by releases-api-live.spec.js.

const RELEASE_PUBLISHED = {
  slug: 'artist-a-song-1', artist: 'Artist A', artistSlug: 'artist-a', title: 'Song 1',
  suffix: 'single', releaseDate: '2024-01-01', status: 'published', tracks: ['Song 1'],
  streaming: {}, createdAt: 'x', updatedAt: 'y',
};
const RELEASE_SCHEDULED_FUTURE = {
  slug: 'artist-a-song-2', artist: 'Artist A', artistSlug: 'artist-a', title: 'Song 2',
  suffix: 'single', releaseDate: '2099-01-01', status: 'scheduled', tracks: ['Song 2'],
  streaming: {}, createdAt: 'x', updatedAt: 'y',
};
const RELEASE_BLOCKED = {
  slug: 'artist-b-song-1', artist: 'Artist B', artistSlug: 'artist-b', title: 'Blocked Song',
  suffix: 'single', releaseDate: '2020-01-01', status: 'scheduled', tracks: ['Blocked Song'],
  streaming: {}, createdAt: 'x', updatedAt: 'y',
};

const ARTIST_COMPLETE = {
  slug: 'artist-a', name: 'Artist A', instagram: 'artist_a', members: [],
  bio: 'A complete bio.', photoKey: 'artist-a-123', createdAt: 'x', updatedAt: 'y',
};
const ARTIST_INCOMPLETE = {
  slug: 'artist-b', name: 'Artist B', instagram: null, members: [],
  createdAt: 'x', updatedAt: 'y', // no bio, no photoKey
};

const TOKEN = 'test-token';

function isAdminGet(urlPath, pathname) {
  const url = new URL(urlPath);
  return url.pathname === pathname && url.searchParams.get('admin') === '1';
}

async function mockAdminApi(page, { releases, artists, tokenValid = true }) {
  // Matched via a URL predicate rather than a glob string with a literal
  // "?" in it -- Playwright's glob routing treats "?" as a one-character
  // wildcard, which is easy to get subtly wrong for query strings.
  await page.route((url) => isAdminGet(url.href, '/api/releases'), async (route) => {
    const auth = await route.request().headerValue('authorization');
    if (tokenValid === false || auth !== `Bearer ${TOKEN}`) {
      return route.fulfill({ status: 401, body: JSON.stringify({ error: 'unauthorized' }) });
    }
    return route.fulfill({ body: JSON.stringify(releases), contentType: 'application/json' });
  });
  await page.route((url) => isAdminGet(url.href, '/api/artists'), (route) =>
    route.fulfill({ body: JSON.stringify(artists), contentType: 'application/json' })
  );
}

async function login(page) {
  await page.fill('#gateToken', TOKEN);
  await page.click('#gateSubmit');
  await expect(page.locator('#app')).toBeVisible();
}

test.describe('Admin Catálogo — gate', () => {
  test('wrong token shows an error and keeps the gate up', async ({ page }) => {
    await mockAdminApi(page, { releases: [], artists: [], tokenValid: false });
    await page.goto('/admin/catalogo.html');
    await page.fill('#gateToken', 'wrong-token');
    await page.click('#gateSubmit');
    await expect(page.locator('#gateError')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });

  test('correct token enters the app @bat', async ({ page }) => {
    await mockAdminApi(page, { releases: [], artists: [] });
    await page.goto('/admin/catalogo.html');
    await login(page);
    await expect(page.locator('#gate')).toBeHidden();
  });
});

test.describe('Admin Catálogo — releases list', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page, {
      releases: [RELEASE_PUBLISHED, RELEASE_SCHEDULED_FUTURE, RELEASE_BLOCKED],
      artists: [ARTIST_COMPLETE, ARTIST_INCOMPLETE],
    });
    await page.goto('/admin/catalogo.html');
    await login(page);
  });

  test('shows the right status pill per release: published, scheduled, and blocked-on-incomplete-artist @bat', async ({ page }) => {
    const rows = page.locator('#releasesTbody tr');
    await expect(rows).toHaveCount(3);

    const publishedRow = rows.filter({ hasText: 'Song 1' });
    await expect(publishedRow.locator('.status-pill')).toHaveClass(/published/);
    await expect(publishedRow.locator('.status-pill')).toHaveText('Publicado');

    const futureRow = rows.filter({ hasText: 'Song 2' });
    await expect(futureRow.locator('.status-pill')).toHaveClass(/scheduled/);

    const blockedRow = rows.filter({ hasText: 'Blocked Song' });
    await expect(blockedRow.locator('.status-pill')).toHaveClass(/blocked/);
    await expect(blockedRow.locator('.status-pill')).toContainText('Artist B');
  });

  test('a scheduled release shows "Publicar ahora"; a published one shows "Pasar a programado"', async ({ page }) => {
    const rows = page.locator('#releasesTbody tr');
    await expect(rows.filter({ hasText: 'Song 1' }).getByRole('button', { name: 'Pasar a programado' })).toBeVisible();
    await expect(rows.filter({ hasText: 'Blocked Song' }).getByRole('button', { name: 'Publicar ahora' })).toBeVisible();
  });
});

test.describe('Admin Catálogo — artists list', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page, { releases: [], artists: [ARTIST_COMPLETE, ARTIST_INCOMPLETE] });
    await page.goto('/admin/catalogo.html');
    await login(page);
    await page.click('#tabArtistsBtn');
  });

  test('shows a complete/incomplete ficha pill per artist @bat', async ({ page }) => {
    const rows = page.locator('#artistsTbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Artist A' }).locator('.status-pill')).toHaveClass(/complete/);
    await expect(rows.filter({ hasText: 'Artist B' }).locator('.status-pill')).toHaveClass(/incomplete/);
  });

  test('tab switching shows exactly one panel at a time', async ({ page }) => {
    await expect(page.locator('#tabArtists')).toBeVisible();
    await expect(page.locator('#tabReleases')).toBeHidden();
    await page.click('#tabReleasesBtn');
    await expect(page.locator('#tabReleases')).toBeVisible();
    await expect(page.locator('#tabArtists')).toBeHidden();
  });
});

test.describe('Admin Catálogo — new release form', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page, { releases: [], artists: [ARTIST_COMPLETE] });
    await page.goto('/admin/catalogo.html');
    await login(page);
    await page.click('#newReleaseBtn');
  });

  test('typing an existing artist name shows no hint; a brand-new name warns about the missing ficha @bat', async ({ page }) => {
    await page.fill('#releaseArtistInput', 'Artist A');
    await expect(page.locator('#artistHint')).toHaveText('');

    await page.fill('#releaseArtistInput', 'Totally New Band');
    await expect(page.locator('#artistHint')).toContainText('Artista nuevo');
  });

  test('submitting sends the expected payload shape', async ({ page }) => {
    let sentBody = null;
    await page.route('**/api/releases', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      sentBody = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        body: JSON.stringify({ ...sentBody, slug: 'artist-a-new-song', artistSlug: 'artist-a', status: 'scheduled' }),
        contentType: 'application/json',
      });
    });

    await page.fill('#releaseArtistInput', 'Artist A');
    await page.fill('input[name=title]', 'New Song');
    await page.fill('input[name=releaseDate]', '2099-06-01');
    await page.fill('#tracksList .subrow input', 'New Song');
    await page.fill('input[name=streamingSpotify]', 'https://open.spotify.com/track/abc');
    await page.click('#releaseForm button[type=submit]');

    await expect.poll(() => sentBody).not.toBeNull();
    expect(sentBody.artist).toBe('Artist A');
    expect(sentBody.title).toBe('New Song');
    expect(sentBody.releaseDate).toBe('2099-06-01');
    expect(sentBody.tracks).toEqual(['New Song']);
    expect(sentBody.streaming).toEqual({ spotify: 'https://open.spotify.com/track/abc' });
  });
});

test.describe('Admin Catálogo — new artist form', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page, { releases: [], artists: [] });
    await page.goto('/admin/catalogo.html');
    await login(page);
    await page.click('#tabArtistsBtn');
    await page.click('#newArtistBtn');
  });

  test('the completeness hint tracks bio text as it\'s typed, and starts non-empty for a fresh form', async ({ page }) => {
    await expect(page.locator('#artistCompleteHint')).toContainText('Falta bio y foto');
    await page.fill('textarea[name=bio]', 'A real bio.');
    await expect(page.locator('#artistCompleteHint')).toContainText('Falta foto');
    await expect(page.locator('#artistCompleteHint')).not.toContainText('bio y foto');
  });

  test('strips a leading @ from the Instagram field on submit', async ({ page }) => {
    let sentBody = null;
    await page.route('**/api/artists', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      sentBody = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        body: JSON.stringify({ ...sentBody, slug: 'new-artist' }),
        contentType: 'application/json',
      });
    });
    await page.fill('input[name=name]', 'New Artist');
    await page.fill('input[name=instagram]', '@new_artist_handle');
    await page.click('#artistForm button[type=submit]');
    await expect.poll(() => sentBody).not.toBeNull();
    expect(sentBody.instagram).toBe('new_artist_handle');
  });
});
