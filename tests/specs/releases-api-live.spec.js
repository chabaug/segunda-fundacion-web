// @ts-check
const { test, expect } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const path = require('path');

// End-to-end coverage of the actual Netlify Functions (routing, auth,
// Blobs persistence, the scheduled->published sweep) rather than just the
// pure logic in releases-store.mts (see releases-store.spec.js for that) --
// boots a real `netlify dev --offline` process against a throwaway port so
// this never collides with the interactive dev server on 8991.
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8994;
const BASE = `http://localhost:${PORT}`;
// Matches CATALOG_ADMIN_TOKEN in the repo's gitignored .env, which
// `netlify dev` injects automatically -- any value works locally, per the
// same convention EVENTS_ADMIN_TOKEN already uses there.
const TOKEN = 'local-dev-test-token';

/** @type {import('child_process').ChildProcess | undefined} */
let child;

async function waitForServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/releases`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`netlify dev did not become ready on port ${PORT} within ${timeoutMs}ms`);
}

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}` };
}

async function req(method, urlPath, body, extraHeaders) {
  const headers = { ...(extraHeaders || {}) };
  const opts = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(BASE + urlPath, opts);
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = text; }
  }
  return { status: res.status, body: json };
}

const TINY_PNG = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
  137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

test.describe('Releases + Artists API (live netlify dev)', () => {
  test.beforeAll(async ({}, testInfo) => {
    // Pure backend/HTTP behavior, not device- or browser-specific -- run it
    // once (desktop project only) rather than booting a second netlify dev
    // process for the mobile project for zero additional coverage.
    test.skip(testInfo.project.name !== 'desktop', 'project-agnostic API test, runs once');
    test.setTimeout(90_000);

    child = spawn('npx', ['netlify', 'dev', '--offline', '-p', String(PORT)], {
      cwd: ROOT,
      shell: true,
      stdio: 'ignore',
    });
    await waitForServer(75_000);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== 'desktop') return;
    if (!child || !child.pid) return;
    // netlify dev spawns its own child processes (a wrapping shell, then
    // node) -- child.kill() alone only kills the shell wrapper on Windows
    // and leaves the actual dev server running and the port bound, so the
    // next test run's beforeAll would hang waiting for a stale server that
    // never restarts. taskkill /T kills the whole process tree.
    if (process.platform === 'win32') {
      try { execSync(`taskkill /pid ${child.pid} /T /F`); } catch {}
    } else {
      child.kill('SIGKILL');
    }
  });

  test('rejects writes without the admin token', async () => {
    const createRelease = await req('POST', '/api/releases', { artist: 'X', title: 'Y', releaseDate: '2099-01-01' });
    expect(createRelease.status).toBe(401);
    const createArtist = await req('POST', '/api/artists', { name: 'X' });
    expect(createArtist.status).toBe(401);
    const adminList = await req('GET', '/api/releases?admin=1');
    expect(adminList.status).toBe(401);
  });

  test('unknown release/artist routes 404 on PATCH/DELETE', async () => {
    const patchRelease = await req('PATCH', '/api/releases/does-not-exist', { title: 'x' }, authHeaders());
    expect(patchRelease.status).toBe(404);
    const deleteArtist = await req('DELETE', '/api/artists/does-not-exist', undefined, authHeaders());
    expect(deleteArtist.status).toBe(404);
  });

  test('creating a release requires artist, title and releaseDate', async () => {
    const res = await req('POST', '/api/releases', { artist: 'X' }, authHeaders());
    expect(res.status).toBe(400);
  });

  test('full lifecycle: scheduled release blocked on an incomplete artist, publishes once the artist profile is complete', async () => {
    test.setTimeout(60_000);
    const suffix = Date.now();
    const artistName = `Test Artist ${suffix}`;
    const releaseTitle = `Test Release ${suffix}`;

    // 1. Create a release for an artist that doesn't exist yet, backdated
    //    so the sweep tries to publish it on the very next read.
    const created = await req(
      'POST',
      '/api/releases',
      { artist: artistName, title: releaseTitle, releaseDate: '2020-01-01', suffix: 'single' },
      authHeaders()
    );
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('scheduled');
    const releaseSlug = created.body.slug;
    const artistSlug = created.body.artistSlug;

    // 2. Public list stays empty: the artist doesn't exist in the artists
    //    store at all yet, so it's incomplete by definition.
    const publicBefore = await req('GET', '/api/releases');
    expect(publicBefore.body.find((r) => r.slug === releaseSlug)).toBeUndefined();

    // 3. Create the artist profile with no bio/photo -- still blocked.
    const artistCreated = await req('POST', '/api/artists', { name: artistName }, authHeaders());
    expect(artistCreated.status).toBe(201);
    expect(artistCreated.body.slug).toBe(artistSlug);

    const stillBlocked1 = await req('GET', '/api/releases?admin=1', undefined, authHeaders());
    expect(stillBlocked1.body.find((r) => r.slug === releaseSlug).status).toBe('scheduled');

    // 4. Add a bio -- still blocked, no photo yet.
    await req('PATCH', `/api/artists/${artistSlug}`, { bio: 'Bio de prueba automatizada.' }, authHeaders());
    const stillBlocked2 = await req('GET', '/api/releases?admin=1', undefined, authHeaders());
    expect(stillBlocked2.body.find((r) => r.slug === releaseSlug).status).toBe('scheduled');

    // 5. Upload a photo -- the release should publish on the very next read.
    const photoRes = await fetch(`${BASE}/api/artists/${artistSlug}/photo`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'image/png' },
      body: TINY_PNG,
    });
    expect(photoRes.status).toBe(200);
    const photoBody = await photoRes.json();
    expect(photoBody.photoKey).toBeTruthy();

    const publicAfter = await req('GET', '/api/releases');
    const published = publicAfter.body.find((r) => r.slug === releaseSlug);
    expect(published).toBeTruthy();
    expect(published.date).toBe('2020-01-01');

    const publicArtists = await req('GET', '/api/artists');
    const publicArtist = publicArtists.body.find((a) => a.slug === artistSlug);
    expect(publicArtist.principal.map((r) => r.slug)).toContain(releaseSlug);

    // 6. The uploaded photo actually serves back real image bytes.
    const photoServe = await fetch(`${BASE}${publicArtist.photo}`);
    expect(photoServe.status).toBe(200);
    expect(photoServe.headers.get('content-type')).toBe('image/png');

    // 7. Cover upload on the release, then serves back the same way.
    const coverRes = await fetch(`${BASE}/api/releases/${releaseSlug}/cover`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'image/png' },
      body: TINY_PNG,
    });
    expect(coverRes.status).toBe(200);
    const coverBody = await coverRes.json();
    const coverServe = await fetch(`${BASE}/api/covers/${coverBody.coverKey}`);
    expect(coverServe.status).toBe(200);

    // Cleanup -- delete the test release/artist so repeat local runs don't
    // accumulate junk in the Blobs sandbox store.
    expect((await req('DELETE', `/api/releases/${releaseSlug}`, undefined, authHeaders())).status).toBe(204);
    expect((await req('DELETE', `/api/artists/${artistSlug}`, undefined, authHeaders())).status).toBe(204);
  });
});
