// @ts-check
const { test, expect } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const path = require('path');

// End-to-end coverage of the actual /api/auth/login Netlify Function
// (netlify/functions/auth-login.mts) -- it reads EVENTS_ADMIN_USER /
// EVENTS_ADMIN_PASSWORD / EVENTS_ADMIN_TOKEN off Netlify.env, which only
// exists inside the real Functions runtime, so this can't be unit-tested
// as pure logic the way releases-store.spec.js does. Boots a real
// `netlify dev --offline` process against a throwaway port, same pattern
// as releases-api-live.spec.js.
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8995;
const BASE = `http://localhost:${PORT}`;
// Matches EVENTS_ADMIN_USER / EVENTS_ADMIN_PASSWORD / EVENTS_ADMIN_TOKEN in
// the repo's gitignored .env, which `netlify dev` injects automatically.
const REAL_USER = 'augusto';
const REAL_PASSWORD = 'local-dev-test-password';
const REAL_TOKEN = 'local-dev-test-token';

/** @type {import('child_process').ChildProcess | undefined} */
let child;

async function waitForServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // /api/auth/login itself only answers POST, but any response (even a
      // 405) means the dev server and this function are both up.
      const res = await fetch(`${BASE}/api/auth/login`);
      if (res.status) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`netlify dev did not become ready on port ${PORT} within ${timeoutMs}ms`);
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test.describe('auth-login.mts (live netlify dev)', () => {
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

  test('correct username and password trade for the real admin token', async () => {
    const { status, body } = await login(REAL_USER, REAL_PASSWORD);
    expect(status).toBe(200);
    expect(body.token).toBe(REAL_TOKEN);
  });

  test('wrong password is rejected without leaking the token', async () => {
    const { status, body } = await login(REAL_USER, 'not-the-password');
    expect(status).toBe(401);
    expect(body.error).toBe('invalid_credentials');
    expect(body.token).toBeUndefined();
  });

  test('wrong username is rejected', async () => {
    const { status, body } = await login('not-augusto', REAL_PASSWORD);
    expect(status).toBe(401);
    expect(body.error).toBe('invalid_credentials');
  });

  test('missing credentials are rejected, not treated as a match against an unset field', async () => {
    const { status, body } = await login('', '');
    expect(status).toBe(401);
    expect(body.error).toBe('invalid_credentials');
  });

  test('non-POST methods are rejected', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, { method: 'GET' });
    expect(res.status).toBe(405);
  });
});
