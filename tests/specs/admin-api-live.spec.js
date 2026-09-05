// @ts-check
const { test, expect } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const path = require('path');

// End-to-end coverage of the two Functions the unified admin portal added:
// /api/pendientes (Blobs-backed CRUD) and /api/status (the proxy over the
// JSON the CI workflows publish to sf-status). Same shape as
// releases-api-live.spec.js -- a real `netlify dev --offline` on its own
// port so it never collides with the interactive dev server or with the
// other live spec.
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8995;
const BASE = `http://localhost:${PORT}`;
// Matches EVENTS_ADMIN_TOKEN in the repo's gitignored .env (and the value
// rts-nightly.yml injects in CI).
const TOKEN = 'local-dev-test-token';

/** @type {import('child_process').ChildProcess | undefined} */
let child;

async function waitForServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/events`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`netlify dev did not become ready on port ${PORT} within ${timeoutMs}ms`);
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

function auth() {
  return { Authorization: `Bearer ${TOKEN}` };
}

test.describe('Admin portal API — pendientes + status (live netlify dev)', () => {
  test.beforeAll(async ({}, testInfo) => {
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
    // netlify dev spawns a shell then node; killing only the shell leaves the
    // port bound (see the same note in releases-api-live.spec.js).
    if (process.platform === 'win32') {
      try { execSync(`taskkill /pid ${child.pid} /T /F`); } catch {}
    } else {
      child.kill('SIGKILL');
    }
  });

  test('pendientes are admin-only — there is no public read', async () => {
    const list = await req('GET', '/api/pendientes');
    expect(list.status).toBe(401);
    const create = await req('POST', '/api/pendientes', { title: 'Sin token' });
    expect(create.status).toBe(401);
  });

  test('full pendiente lifecycle: create, patch, resolve, delete', async () => {
    const created = await req('POST', '/api/pendientes', {
      title: 'Falta el flyer de prueba',
      category: 'esperando-terceros',
      detail: 'Lo manda el diseñador.',
    }, auth());
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();
    expect(created.body.status).toBe('open');
    const id = created.body.id;

    const listed = await req('GET', '/api/pendientes', undefined, auth());
    expect(listed.status).toBe(200);
    expect(listed.body.some((p) => p.id === id)).toBe(true);

    const resolved = await req('PATCH', `/api/pendientes/${id}`, { status: 'done' }, auth());
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('done');
    expect(resolved.body.title).toBe('Falta el flyer de prueba'); // untouched fields survive

    const deleted = await req('DELETE', `/api/pendientes/${id}`, undefined, auth());
    expect(deleted.status).toBe(204);

    const after = await req('GET', '/api/pendientes', undefined, auth());
    expect(after.body.some((p) => p.id === id)).toBe(false);
  });

  test('a pendiente needs a title, and an unknown category falls back instead of being stored raw', async () => {
    const noTitle = await req('POST', '/api/pendientes', { detail: 'sin título' }, auth());
    expect(noTitle.status).toBe(400);

    const weird = await req('POST', '/api/pendientes', { title: 'Categoría rara', category: 'no-existe' }, auth());
    expect(weird.status).toBe(201);
    expect(weird.body.category).toBe('implementacion');
    await req('DELETE', `/api/pendientes/${weird.body.id}`, undefined, auth());
  });

  test('patching a pendiente that does not exist is a 404, not a silent create', async () => {
    const missing = await req('PATCH', '/api/pendientes/no-existe', { status: 'done' }, auth());
    expect(missing.status).toBe(404);
  });

  test('status is admin-only and always answers with every key the portal reads', async () => {
    const anon = await req('GET', '/api/status');
    expect(anon.status).toBe(401);

    const ok = await req('GET', '/api/status', undefined, auth());
    expect(ok.status).toBe(200);
    // The upstream files may legitimately be missing (nothing published yet,
    // or no network in this environment) -- the contract is that every key is
    // present and null-able, so the portal never has to guard for undefined.
    for (const key of ['bat', 'rts', 'batHistory', 'rtsHistory', 'testPendientes', 'coverage']) {
      expect(Object.prototype.hasOwnProperty.call(ok.body, key)).toBe(true);
    }
    expect(ok.body.fetchedAt).toBeTruthy();
  });
});
