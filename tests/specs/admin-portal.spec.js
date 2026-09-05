// @ts-check
const { test, expect } = require('@playwright/test');
const {
  TOKEN, USER, PASSWORD, mockAdminApi, suiteSummary, historyRun, login, openPortal,
} = require('../support/admin-portal');

// The four admin panels live in one page now (/admin/index.html): one login,
// one hash-routed shell, four sections. This spec covers the shell itself
// (gate, routing, cross-section jumps) and the two sections that have no
// other coverage — Tests and Estado. Eventos and Lanzamientos keep their own
// specs.

test.describe('Admin portal — gate', () => {
  test('wrong credentials show an error and keep the gate up', async ({ page }) => {
    await mockAdminApi(page, {});
    await page.goto('/admin/index.html');
    await page.fill('#gateUser', USER);
    await page.fill('#gatePassword', 'not-the-password');
    await page.click('#gateSubmit');
    await expect(page.locator('#gateError')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });

  test('correct credentials enter the portal on the Eventos section @bat', async ({ page }) => {
    await mockAdminApi(page, {});
    await page.goto('/admin/index.html');
    await login(page);
    await expect(page.locator('#gate')).toBeHidden();
    await expect(page.locator('#section-eventos')).toBeVisible();
    await expect(page.locator('.nav-btn[data-section="eventos"]')).toHaveClass(/active/);
  });

  test('the token is stored once for the whole portal, not per section', async ({ page }) => {
    await mockAdminApi(page, {});
    await page.goto('/admin/index.html');
    await login(page);
    const stored = await page.evaluate(() => localStorage.getItem('sfAdminToken'));
    expect(stored).toBe(TOKEN);
  });

  test('a token left over from the old Eventos panel is adopted instead of asking again', async ({ page }) => {
    await mockAdminApi(page, {});
    await page.goto('/admin/index.html');
    await page.evaluate((t) => localStorage.setItem('sfEventsAdminToken', t), TOKEN);
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#gate')).toBeHidden();
  });

  test('Salir clears the session and brings the gate back', async ({ page }) => {
    await mockAdminApi(page, {});
    await openPortal(page);
    await page.click('#logoutBtn');
    await expect(page.locator('#gate')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('sfAdminToken'));
    expect(stored).toBeNull();
  });
});

test.describe('Admin portal — routing', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page, {});
  });

  test('each nav button shows exactly one section and writes its hash @bat', async ({ page }) => {
    await openPortal(page);
    for (const name of ['lanzamientos', 'tests', 'estado', 'eventos']) {
      await page.click(`.nav-btn[data-section="${name}"]`);
      await expect(page.locator('#section-' + name)).toBeVisible();
      await expect(page.locator('.admin-section:visible')).toHaveCount(1);
      expect(new URL(page.url()).hash).toBe('#' + name);
    }
  });

  test('a deep link opens straight into that section', async ({ page }) => {
    await page.goto('/admin/index.html#estado');
    await login(page);
    await expect(page.locator('#section-estado')).toBeVisible();
    await expect(page.locator('#section-eventos')).toBeHidden();
  });
});

test.describe('Admin portal — Tests section', () => {
  const STATUS = {
    fetchedAt: '2026-09-04T05:00:00.000Z',
    bat: suiteSummary('BAT', { counts: { passed: 229, failed: 0, skipped: 3, flaky: 0, total: 232 } }),
    rts: suiteSummary('RTS', { counts: { passed: 499, failed: 2, skipped: 9, flaky: 0, total: 510 } }),
    // 12 runs so the "últimas 10" trim is exercised, not just rendered.
    batHistory: Array.from({ length: 12 }, (_, i) => historyRun(i + 1)),
    rtsHistory: [historyRun(3, { suite: 'RTS', commit: 'rts123' })],
    testPendientes: {
      generatedAt: '2026-09-03',
      items: [{ category: 'skip', suite: 'BAT', title: 'un test salteado', reason: 'necesita puntero táctil' }],
    },
    coverage: null,
  };

  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page, { status: STATUS });
    await openPortal(page, 'tests');
  });

  test('shows the latest run of both suites, failures called out @bat', async ({ page }) => {
    const stats = page.locator('#testStats .stat');
    await expect(stats.filter({ hasText: 'BAT passed' }).locator('.n')).toHaveText('229');
    await expect(stats.filter({ hasText: 'RTS failed' }).locator('.n')).toHaveText('2');
    await expect(stats.filter({ hasText: 'RTS failed' })).toHaveClass(/bad/);
    await expect(stats.filter({ hasText: 'BAT failed' })).toHaveClass(/ok/);
  });

  test('the skip reasons published by CI are listed', async ({ page }) => {
    await expect(page.locator('#testPendList')).toContainText('un test salteado');
    await expect(page.locator('#testPendList')).toContainText('puntero táctil');
  });

  test('history is collapsed until asked for, then shows the last 10 runs @bat', async ({ page }) => {
    await expect(page.locator('#histPanel')).toBeHidden();
    await page.click('#histToggleBtn');
    await expect(page.locator('#histPanel')).toBeVisible();
    await expect(page.locator('#histTbody tr')).toHaveCount(10);
    // Newest first, and run 12 is the newest of the 12 mocked.
    await expect(page.locator('#histTbody tr').first()).toContainText('c12');
    await expect(page.locator('#histTbody tr').last()).toContainText('c3');
  });

  test('switching the suite re-renders the history for that suite', async ({ page }) => {
    await page.click('#histToggleBtn');
    await expect(page.locator('#histTbody tr')).toHaveCount(10);
    await page.click('#histSuiteRTS');
    await expect(page.locator('#histTbody tr')).toHaveCount(1);
    await expect(page.locator('#histTbody tr').first()).toContainText('rts123');
  });

  test('a suite with no history yet says so instead of rendering an empty chart', async ({ page }) => {
    await page.route((url) => new URL(url.href).pathname === '/api/status', (route) =>
      route.fulfill({
        body: JSON.stringify({ ...STATUS, batHistory: [] }),
        contentType: 'application/json',
      })
    );
    await page.click('#testsReloadBtn');
    await page.click('#histToggleBtn');
    await expect(page.locator('#histEmpty')).toBeVisible();
    await expect(page.locator('#histEmpty')).toContainText('BAT');
  });
});

test.describe('Admin portal — Estado section', () => {
  const RELEASE_WITH_COVER = {
    slug: 'artist-a-song-1', artist: 'Artist A', artistSlug: 'artist-a', title: 'Song 1',
    releaseDate: '2024-01-01', status: 'published', tracks: [], coverKey: 'k1',
    credits: 'Producción: alguien', streaming: { spotify: 'https://open.spotify.com/x' },
  };
  const RELEASE_NO_COVER = {
    slug: 'artist-a-song-2', artist: 'Artist A', artistSlug: 'artist-a', title: 'Song 2',
    releaseDate: '2024-02-01', status: 'published', tracks: [], credits: 'Producción: alguien',
    streaming: { spotify: 'https://open.spotify.com/y' },
  };
  const ARTIST = {
    slug: 'artist-a', name: 'Artist A', instagram: 'artist_a', members: [],
    bio: 'Bio.', photoKey: 'p1',
  };
  const PENDIENTE = {
    id: 'flyer-fiebre-lunar', category: 'esperando-terceros', title: 'Falta el flyer',
    detail: 'Lo manda el diseñador.', status: 'open', createdAt: 'x', updatedAt: 'y',
  };
  const COVERAGE = {
    generatedAt: '2026-09-04T05:00:00.000Z',
    commit: 'abc1234',
    totals: { pages: 2, pagesCovered: 1, specs: 3, unitSpecs: 1, tests: 40, batTests: 8 },
    pages: [
      { page: '/catalogo.html', specs: ['catalogo.spec.js'], tests: 40, batTests: 8 },
      { page: '/admin/index.html', specs: [], tests: 0, batTests: 0 },
    ],
    specs: [
      { file: 'catalogo.spec.js', tests: 40, batTests: 8, pages: ['/catalogo.html'] },
      { file: 'releases-store.spec.js', tests: 7, batTests: 0, pages: [] },
    ],
  };

  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page, {
      releases: [RELEASE_WITH_COVER, RELEASE_NO_COVER],
      artists: [ARTIST],
      events: [],
      pendientes: [PENDIENTE],
      status: { bat: null, rts: null, batHistory: [], rtsHistory: [], testPendientes: null, coverage: COVERAGE },
    });
    await openPortal(page, 'estado');
  });

  test('lists the curated pendientes with their category @bat', async ({ page }) => {
    await expect(page.locator('#pendientesList li')).toHaveCount(1);
    await expect(page.locator('#pendientesList')).toContainText('Falta el flyer');
    await expect(page.locator('#pendientesList .status-pill')).toHaveText('Esperando a terceros');
  });

  test('marking one resolved PATCHes its status', async ({ page }) => {
    let sentBody = null;
    await page.route((url) => new URL(url.href).pathname === '/api/pendientes/flyer-fiebre-lunar', (route) => {
      sentBody = route.request().postDataJSON();
      return route.fulfill({
        body: JSON.stringify({ ...PENDIENTE, status: 'done' }),
        contentType: 'application/json',
      });
    });
    await page.getByRole('button', { name: 'Resuelto' }).click();
    await expect.poll(() => sentBody).not.toBeNull();
    expect(sentBody.status).toBe('done');
    await expect(page.locator('#pendientesList li').first()).toHaveClass(/done/);
  });

  test('creating one posts title, category and detail', async ({ page }) => {
    let sentBody = null;
    await page.route((url) => new URL(url.href).pathname === '/api/pendientes', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      sentBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, body: JSON.stringify({ ...sentBody, id: 'nuevo', status: 'open' }), contentType: 'application/json' });
    });
    await page.click('#newPendienteBtn');
    await page.fill('#pendienteForm input[name=title]', 'Definir SoundCloud');
    await page.selectOption('#pendienteForm select[name=category]', 'decision-pendiente');
    await page.fill('#pendienteForm textarea[name=detail]', 'Falta el ok de Augusto.');
    await page.click('#pendienteForm button[type=submit]');

    await expect.poll(() => sentBody).not.toBeNull();
    expect(sentBody.title).toBe('Definir SoundCloud');
    expect(sentBody.category).toBe('decision-pendiente');
    expect(sentBody.detail).toBe('Falta el ok de Augusto.');
  });

  test('content coverage counts what is actually loaded @bat', async ({ page }) => {
    const coverRow = page.locator('.cov-row').filter({ hasText: 'Lanzamientos con tapa' });
    await expect(coverRow.locator('.cov-n')).toHaveText('1/2');
    const creditsRow = page.locator('.cov-row').filter({ hasText: 'Con créditos' });
    await expect(creditsRow.locator('.cov-n')).toHaveText('2/2');
  });

  test('a content gap links straight to the form that fixes it @bat', async ({ page }) => {
    const gap = page.locator('#contentGaps li').filter({ hasText: 'Song 2' });
    await expect(gap).toContainText('sin tapa');
    await gap.getByRole('button', { name: 'Editar' }).click();

    await expect(page.locator('#section-lanzamientos')).toBeVisible();
    await expect(page.locator('#releaseFormSection')).toBeVisible();
    await expect(page.locator('#releaseFormTitle')).toHaveText('Editar lanzamiento');
    await expect(page.locator('#releaseForm input[name=title]')).toHaveValue('Song 2');
  });

  test('test coverage flags pages with no specs @bat', async ({ page }) => {
    const rows = page.locator('#testCovTbody tr');
    await expect(rows).toHaveCount(2);
    const uncovered = rows.filter({ hasText: '/admin/index.html' });
    await expect(uncovered.locator('.status-pill')).toHaveText('Sin tests');
    const covered = rows.filter({ hasText: '/catalogo.html' });
    await expect(covered.locator('.status-pill')).toHaveText('Cubierta');
    await expect(page.locator('#testCovMeta')).toContainText('1/2 páginas');
  });

  test('unit specs are reported separately, not counted as an uncovered page', async ({ page }) => {
    await expect(page.locator('#unitSpecs')).toContainText('releases-store.spec.js');
  });
});
