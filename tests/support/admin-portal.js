// Shared mocks for the /admin portal specs. The portal talks to six admin
// endpoints and every section boots off them, so each spec would otherwise
// re-declare the same routing. Lives outside specs/ so Playwright doesn't
// try to run it as a suite.
const { expect } = require('@playwright/test');

const TOKEN = 'test-token';
const USER = 'augusto';
const PASSWORD = 'test-password';

function pathIs(href, pathname) {
  return new URL(href).pathname === pathname;
}

// Mocks the whole admin API surface. Tests that care about a specific write
// register their own route afterwards — Playwright matches the most recently
// registered route first, so a later, narrower handler wins.
async function mockAdminApi(page, opts) {
  const o = opts || {};
  const events = o.events || [];
  const releases = o.releases || [];
  const artists = o.artists || [];
  const pendientes = o.pendientes || [];
  const status = o.status || null;
  const tokenValid = o.tokenValid !== false;

  await page.route((url) => pathIs(url.href, '/api/auth/login'), (route) => {
    const body = route.request().postDataJSON() || {};
    if (body.username === USER && body.password === PASSWORD) {
      return route.fulfill({ body: JSON.stringify({ token: TOKEN }), contentType: 'application/json' });
    }
    return route.fulfill({ status: 401, body: JSON.stringify({ error: 'invalid_credentials' }) });
  });

  const guarded = (payload) => async (route) => {
    const auth = await route.request().headerValue('authorization');
    if (!tokenValid || auth !== `Bearer ${TOKEN}`) {
      return route.fulfill({ status: 401, body: JSON.stringify({ error: 'unauthorized' }) });
    }
    return route.fulfill({ body: JSON.stringify(payload), contentType: 'application/json' });
  };

  await page.route((url) => pathIs(url.href, '/api/events'), guarded(events));
  await page.route((url) => pathIs(url.href, '/api/releases'), guarded(releases));
  await page.route((url) => pathIs(url.href, '/api/artists'), guarded(artists));
  await page.route((url) => pathIs(url.href, '/api/pendientes'), guarded(pendientes));
  await page.route((url) => pathIs(url.href, '/api/status'), guarded(status || emptyStatus()));
}

function emptyStatus() {
  return { fetchedAt: new Date().toISOString(), bat: null, rts: null, batHistory: [], rtsHistory: [], testPendientes: null, coverage: null };
}

function suiteSummary(suite, over) {
  return Object.assign({
    suite,
    generatedAt: '2026-09-04T04:00:00.000Z',
    commit: 'abc1234',
    runUrl: 'https://github.com/chabaug/segunda-fundacion-web/actions/runs/1',
    durationMs: 200000,
    counts: { passed: 100, failed: 0, skipped: 2, flaky: 0, total: 102 },
    failures: [],
    skips: [],
  }, over || {});
}

function historyRun(day, over) {
  return Object.assign({
    suite: 'BAT',
    generatedAt: `2026-09-${String(day).padStart(2, '0')}T04:00:00.000Z`,
    commit: 'c' + day,
    runUrl: 'https://github.com/chabaug/segunda-fundacion-web/actions/runs/' + day,
    durationMs: 200000 + day * 1000,
    counts: { passed: 100 + day, failed: 0, skipped: 2, flaky: 0, total: 102 + day },
  }, over || {});
}

async function login(page) {
  await page.fill('#gateUser', USER);
  await page.fill('#gatePassword', PASSWORD);
  await page.click('#gateSubmit');
  await expect(page.locator('#app')).toBeVisible();
}

async function openPortal(page, section) {
  await page.goto('/admin/index.html');
  await login(page);
  if (section) {
    await page.click(`.nav-btn[data-section="${section}"]`);
    await expect(page.locator('#section-' + section)).toBeVisible();
  }
}

module.exports = { TOKEN, USER, PASSWORD, mockAdminApi, emptyStatus, suiteSummary, historyRun, login, openPortal };
