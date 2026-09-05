// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Nav — omits the current page (and Artistas, folded into Catálogo) and hamburger menu', () => {
  const pages = ['index.html', 'catalogo.html', 'videoclips.html', 'eventos.html', 'nosotros.html'];

  for (const page_ of pages) {
    const tag = page_ === 'catalogo.html' ? ' @bat' : '';
    test(`nav shows the other 4 pages, not itself or Artistas, on ${page_}${tag}`, async ({ page }) => {
      await page.goto('/' + page_);
      const hrefs = await page.locator('.nav-links a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
      expect(hrefs).toEqual(pages.filter((p) => p !== page_));
    });
  }

  test('hamburger toggle is hidden on desktop width and the links show inline @bat', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/catalogo.html');
    await expect(page.locator('#navToggle')).toBeHidden();
    await expect(page.locator('#navLinks')).toBeVisible();
  });

  test('below the breakpoint, links are hidden until the hamburger is clicked, then toggle back closed @bat', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/catalogo.html');
    const toggle = page.locator('#navToggle');
    const links = page.locator('#navLinks');
    await expect(toggle).toBeVisible();
    await expect(links).toBeHidden();

    await toggle.click();
    await expect(links).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    await expect(links).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Home page (index.html)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('shows a fixed single-video embed, not a channel-uploads playlist @bat', async ({ page }) => {
    const src = await page.locator('.video-frame iframe').getAttribute('src');
    expect(src).toMatch(/^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/);
    expect(src).not.toContain('videoseries');
  });

  test('embeds the Spotify playlist', async ({ page }) => {
    const src = await page.locator('.spotify-frame iframe').getAttribute('src');
    expect(src).toContain('open.spotify.com/embed/playlist/');
  });

  test('nav links to the other 4 pages (not itself) and none are broken (200 OK)', async ({ page }) => {
    const hrefs = await page.locator('.nav-links a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.sort()).toEqual(['catalogo.html', 'eventos.html', 'nosotros.html', 'videoclips.html'].sort());
    for (const href of hrefs) {
      const res = await page.request.get('/' + href);
      expect(res.status(), href).toBe(200);
    }
  });

  test('Último video / Último lanzamiento order by real date, not by the release the video happens to promote @bat', async ({ page }) => {
    // Regression test: the video "Nave" was uploaded 2026-04-30, months after
    // the Sintonía Solar release it's actually about — comparing against the
    // linked release's own date (the old approach) put the older-dated
    // release module on top even though the video was clearly more recent.
    // The video's real date normally comes from /api/youtube-video (see
    // netlify/functions/youtube-sweep.mts) instead of a hand-maintained
    // attribute — mocked here since the plain static test server doesn't
    // run Netlify Functions. Reusing the same fixture date the old
    // data-video-date="2026-04-30" attribute had keeps this exercising the
    // "video wins" branch.
    const mockVideo = { videoId: 'pRbvFopJc-s', title: 'Radio Mercurio — Nave', publishedAt: '2026-04-30' };
    await page.route('**/api/youtube-video', (route) =>
      route.fulfill({ body: JSON.stringify(mockVideo), contentType: 'application/json' })
    );
    await page.reload();
    await page.waitForFunction(
      (videoId) => document.getElementById('videoFrame').src.includes(videoId),
      mockVideo.videoId
    );

    const sections = await page.locator('main.wrap > section').evaluateAll((els) =>
      els.map((e) => e.id).filter((id) => id === 'latestRelease' || id === 'video')
    );
    const latestDate = await page.evaluate(() => {
      let d = null;
      for (const slug in RELEASES) if (!d || RELEASES[slug].date > d) d = RELEASES[slug].date;
      return d;
    });
    const expectedOrder = mockVideo.publishedAt >= latestDate ? ['video', 'latestRelease'] : ['latestRelease', 'video'];
    expect(sections).toEqual(expectedOrder);
  });
});

test.describe('Title entrance animation', () => {
  // Ported from Bateristico's PageHeader: the title rises up out of a
  // clipping mask on load rather than just appearing — the site's one
  // consistent entrance gesture across every page.
  const pages = ['index.html', 'catalogo.html', 'videoclips.html', 'eventos.html', 'nosotros.html'];
  for (const page_ of pages) {
    const tag = page_ === 'catalogo.html' ? ' @bat' : '';
    test(`${page_} title has the mask-and-rise animation${tag}`, async ({ page }) => {
      await page.goto('/' + page_);
      const inner = page.locator('.title-inner').first();
      await expect(inner).toBeVisible();
      const animationName = await inner.evaluate((el) => getComputedStyle(el).animationName);
      expect(animationName).toBe('titleUnmask');
      // The mask wrapper must actually clip, or the title would visibly
      // slide up from off-screen instead of unmasking in place.
      const clipOverflow = await page.locator('.title-clip').first().evaluate((el) => getComputedStyle(el).overflow);
      expect(clipOverflow).toBe('hidden');
    });
  }
});

test.describe('Nosotros page', () => {
  test('shows the YouTube, Spotify, Instagram, X and TikTok follow links @bat', async ({ page }) => {
    await page.goto('/nosotros.html');
    const links = page.locator('.link-card');
    await expect(links).toHaveCount(5);
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.some((h) => h.includes('youtube.com'))).toBe(true);
    expect(hrefs.some((h) => h.includes('open.spotify.com'))).toBe(true);
    expect(hrefs.some((h) => h.includes('instagram.com'))).toBe(true);
    expect(hrefs.some((h) => h.includes('x.com'))).toBe(true);
    expect(hrefs.some((h) => h.includes('tiktok.com'))).toBe(true);
    // Every follow card carries its platform's icon, not just a text label.
    await expect(page.locator('.link-card .icon svg')).toHaveCount(5);
  });

  test('contact form sends the entered fields to Web3Forms and shows a success message @bat', async ({ page }) => {
    await page.goto('/nosotros.html');
    let posted = null;
    await page.route('https://api.web3forms.com/submit', (route) => {
      posted = JSON.parse(route.request().postData());
      return route.fulfill({ json: { success: true, message: 'ok' } });
    });

    await page.fill('#contactName', 'Ada Lovelace');
    await page.fill('#contactEmail', 'ada@example.com');
    await page.fill('#contactMessage', 'Hola, quería consultar algo.');
    await page.click('.contact-submit');

    await expect(page.locator('#contactStatus')).toHaveClass(/show/);
    await expect(page.locator('#contactStatus')).toHaveClass(/ok/);
    await expect(page.locator('#contactStatus')).toHaveText(/enviado/i);

    expect(posted.name).toBe('Ada Lovelace');
    expect(posted.email).toBe('ada@example.com');
    expect(posted.message).toBe('Hola, quería consultar algo.');
    expect(posted.access_key).toBeTruthy();

    // The form clears once the message is confirmed sent.
    await expect(page.locator('#contactName')).toHaveValue('');
  });

  test('contact form requires name, a validly-formatted email, and a message before it will submit', async ({ page }) => {
    await page.goto('/nosotros.html');
    let submitted = false;
    await page.route('https://api.web3forms.com/submit', (route) => {
      submitted = true;
      return route.fulfill({ json: { success: true } });
    });

    // Invalid email format — the native email input blocks submission.
    await page.fill('#contactName', 'Test');
    await page.fill('#contactEmail', 'not-an-email');
    await page.fill('#contactMessage', 'Hola');
    await page.click('.contact-submit');
    await page.waitForTimeout(300);
    expect(submitted).toBe(false);

    const isValid = await page.locator('#contactEmail').evaluate((el) => el.checkValidity());
    expect(isValid).toBe(false);
  });

  test('contact form shows an error message if the request fails', async ({ page }) => {
    await page.goto('/nosotros.html');
    await page.route('https://api.web3forms.com/submit', (route) =>
      route.fulfill({ json: { success: false, message: 'nope' } })
    );

    await page.fill('#contactName', 'Test');
    await page.fill('#contactEmail', 'test@example.com');
    await page.fill('#contactMessage', 'Hola');
    await page.click('.contact-submit');

    await expect(page.locator('#contactStatus')).toHaveClass(/error/);
  });
});

test.describe('Cross-page navigation', () => {
  // Below the 700px breakpoint the links live behind a hamburger toggle —
  // open it first if it's the visible control, no-op otherwise.
  async function openNavIfCollapsed(page) {
    const toggle = page.locator('#navToggle');
    // Check the actual computed style rather than Playwright's `isVisible()`
    // heuristic, which doesn't auto-wait and can read stale state right after
    // a fresh navigation.
    const collapsed = await toggle.evaluate((el) => getComputedStyle(el).display !== 'none');
    if (collapsed) await toggle.click();
  }

  test('clicking through Inicio → Catálogo → Videoclips → Eventos → Nosotros lands on the right page each time @bat', async ({ page }) => {
    await page.goto('/index.html');
    await openNavIfCollapsed(page);
    await page.click('.nav-links a[href="catalogo.html"]');
    await expect(page).toHaveURL(/catalogo\.html/);
    await openNavIfCollapsed(page);
    await page.click('.nav-links a[href="videoclips.html"]');
    await expect(page).toHaveURL(/videoclips\.html/);
    await openNavIfCollapsed(page);
    await page.click('.nav-links a[href="eventos.html"]');
    await expect(page).toHaveURL(/eventos\.html/);
    await openNavIfCollapsed(page);
    await page.click('.nav-links a[href="nosotros.html"]');
    await expect(page).toHaveURL(/nosotros\.html/);
    await openNavIfCollapsed(page);
    await page.click('.nav-links a[href="index.html"]');
    await expect(page).toHaveURL(/index\.html/);
  });
});
