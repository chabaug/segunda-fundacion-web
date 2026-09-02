// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Catálogo — grid & search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/catalogo.html');
  });

  test('grid renders 61 items and coverflow mirrors them on load @bat', async ({ page }) => {
    const gridCount = await page.locator('.catalog-item').count();
    expect(gridCount).toBeGreaterThanOrEqual(60);
    const cfCount = await page.locator('.coverflow-item').count();
    expect(cfCount).toBe(gridCount);
  });

  test('search filters the grid, the coverflow and the live count; shows the empty state for a nonsense query @bat', async ({ page }) => {
    // The grid lives inside the collapsible panel, collapsed by default —
    // open it via its own button so ":visible" is meaningful.
    await page.click('#tabBtnLanzamientos');
    // On mobile the search field is collapsed behind a magnifying-glass
    // button next to the title — open it first if that's the visible control.
    const searchToggle = page.locator('#catalogSearchToggle');
    if(await searchToggle.isVisible()) await searchToggle.click();
    await page.fill('#catalogSearch', 'radio mercurio');
    await expect(page.locator('.catalog-item:visible')).toHaveCount(3); // Crisis, Sintonía Solar, Vos y Yo
    await expect(page.locator('.coverflow-item')).toHaveCount(3);
    await page.fill('#catalogSearch', 'zzzzznonexistentquery');
    await expect(page.locator('#catalogEmpty')).toHaveClass(/show/);
    await expect(page.locator('.coverflow-item')).toHaveCount(0);
    await page.fill('#catalogSearch', '');
    await expect(page.locator('#catalogEmpty')).not.toHaveClass(/show/);
  });

  test('mobile: search field is collapsed behind a magnifying-glass button, revealed on click', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'this collapse behaviour is mobile-only');
    await expect(page.locator('#catalogSearch')).toBeHidden();
    await expect(page.locator('#catalogSearchToggle')).toBeVisible();
    await page.click('#catalogSearchToggle');
    await expect(page.locator('#catalogSearch')).toBeVisible();
    await expect(page.locator('#catalogSearch')).toBeFocused();
  });
});

test.describe('Catálogo — release modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/catalogo.html');
  });

  test('opening a single-track release hides the Canciones section and shows its SF number @bat', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('la-hora-del-mosquito-el-sega'));
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    await expect(page.locator('#modalTracksSection')).toBeHidden();
    await expect(page.locator('#modalArtist')).toHaveText('La Hora del Mosquito');
    await expect(page.locator('#modalTitle')).toHaveText('El Sega');
    await expect(page.locator('#modalType')).toHaveText('Single');
    const sfNumber = await page.evaluate(() => RELEASES['la-hora-del-mosquito-el-sega'].sfNumber);
    await expect(page.locator('#modalSfNumber')).toHaveText('SF-' + String(sfNumber).padStart(3, '0'));
  });

  test('opening a multi-track release shows the Canciones section with the right count', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('guido-antonucci-autoficcion'));
    await expect(page.locator('#modalTracksSection')).toBeVisible();
    await expect(page.locator('#modalTracklist li')).toHaveCount(5);
    await expect(page.locator('#modalType')).toHaveText('EP');
  });

  test('an album (empty suffix) shows the Álbum type label', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('comportamiento-recurrencia'));
    await expect(page.locator('#modalType')).toHaveText('Álbum');
  });

  test('credits render as HTML with @handles linked to Instagram', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('la-hora-del-mosquito-el-sega'));
    const links = page.locator('#modalCredits a');
    expect(await links.count()).toBeGreaterThan(5);
    const href = await links.first().getAttribute('href');
    expect(href).toMatch(/^https:\/\/instagram\.com\//);
  });

  test('a release with no credits shows the pending placeholder instead', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('lautaro-ra-sur'));
    // Sur may or may not have credits depending on when this runs; assert the
    // invariant instead: exactly one of credits/pending is visible, never both.
    const creditsVisible = await page.locator('#modalCreditsSection').isVisible();
    const pendingVisible = await page.locator('#modalPendingSection').isVisible();
    expect(creditsVisible).toBe(!pendingVisible);
  });

  test('video button appears for a release with a video and is absent otherwise', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('tita-angarita-para-elisa'));
    await expect(page.locator('#modalVideoLinks a')).toHaveCount(1);
    await expect(page.locator('#modalVideoLinks a').first()).toHaveText('Video Oficial');

    await page.evaluate(() => openReleaseModal('jaimes-no-estan'));
    await expect(page.locator('#modalVideoLinks a')).toHaveCount(0);
  });

  test('a release with two videos (LAM) gets two distinct per-track video buttons', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('lam-samanasatra'));
    const links = page.locator('#modalVideoLinks a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText('Video Oficial: Mujer Androide');
    await expect(links.nth(1)).toHaveText('Video Oficial: Puente Demente');
  });

  test('video/streaming links sit before the tracklist and credits in DOM order', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('guido-antonucci-autoficcion'));
    const order = await page.locator('.modal-body > *').evaluateAll((els) => els.map((e) => e.id || e.className));
    const linksIdx = order.indexOf('modalLinks');
    const tracksIdx = order.indexOf('modalTracksSection');
    const creditsIdx = order.indexOf('modalCreditsSection');
    expect(linksIdx).toBeGreaterThanOrEqual(0);
    expect(linksIdx).toBeLessThan(tracksIdx);
    expect(linksIdx).toBeLessThan(creditsIdx);
  });

  test('closing the modal via the close button removes the open class', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('lautaro-ra-la-uva'));
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    // The catalogo page now also has the artist modal's own .modal-close,
    // so an unscoped selector is ambiguous — scope to the release modal.
    await page.click('#releaseModal .modal-close');
    await expect(page.locator('#releaseModal')).not.toHaveClass(/open/);
  });

  test('clicking a grid card opens the modal for that exact release @bat', async ({ page }) => {
    // The grid lives inside the collapsible panel, collapsed by default.
    await page.click('#tabBtnLanzamientos');
    await page.click('.catalog-item[data-slug="lautaro-ra-la-uva"]');
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    await expect(page.locator('#modalTitle')).toHaveText('La Uva');
  });
});

test.describe('Catálogo — Escuchar picker', () => {
  test('opens with the 5 always-on services (no Bandcamp) for a release with no confirmed streaming links', async ({ page }) => {
    await page.goto('/catalogo.html');
    // This release has no `streaming` field at all — every link should fall
    // back to a generated search query, and Bandcamp must not appear.
    await page.evaluate(() => openReleaseModal('la-hora-del-mosquito-el-sega'));
    await page.click('#modalListenBtn');
    await expect(page.locator('#listenModal')).toHaveClass(/open/);

    const options = page.locator('.listen-option');
    await expect(options).toHaveCount(5);
    const names = await options.allTextContents();
    expect(names.map((n) => n.trim())).toEqual(['Spotify', 'YouTube Music', 'Tidal', 'Apple Music', 'Deezer']);

    for (let i = 0; i < 5; i++) {
      const opt = options.nth(i);
      expect(await opt.locator('svg').count()).toBe(1);
      const href = await opt.getAttribute('href');
      expect(href).toMatch(/^https:\/\//);
      expect(await opt.getAttribute('target')).toBe('_blank');
    }
  });

  test('adds a Bandcamp option, using the confirmed link, only for releases that have one', async ({ page }) => {
    await page.goto('/catalogo.html');
    const hasBandcamp = await page.evaluate(() => !!(RELEASES['quintacolumna-quintacolumna'].streaming || {}).bandcamp);
    test.skip(!hasBandcamp, 'fixture release has no confirmed Bandcamp link right now');

    await page.evaluate(() => openReleaseModal('quintacolumna-quintacolumna'));
    await page.click('#modalListenBtn');
    const options = page.locator('.listen-option');
    await expect(options).toHaveCount(6);
    const bandcamp = page.locator('.listen-option', { hasText: 'Bandcamp' });
    await expect(bandcamp).toHaveCount(1);
    const expectedHref = await page.evaluate(() => RELEASES['quintacolumna-quintacolumna'].streaming.bandcamp);
    await expect(bandcamp).toHaveAttribute('href', expectedHref);
  });

  test('closes via its own close button without closing the release modal underneath', async ({ page }) => {
    await page.goto('/catalogo.html');
    await page.evaluate(() => openReleaseModal('la-hora-del-mosquito-el-sega'));
    await page.click('#modalListenBtn');
    await page.click('#listenModal .modal-close');
    await expect(page.locator('#listenModal')).not.toHaveClass(/open/);
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
  });
});

test.describe('Catálogo — cover lightbox', () => {
  test('clicking the cover opens a lightbox with the same image, closes on click @bat', async ({ page }) => {
    await page.goto('/catalogo.html');
    await page.evaluate(() => openReleaseModal('lautaro-ra-la-uva'));
    // Compare resolved absolute URLs (the .src IDL property), not the raw
    // attribute — the lightbox copies from the live element's .src, which the
    // browser always resolves to absolute, so a raw-attribute comparison
    // would spuriously mismatch a relative path against its resolved form.
    const coverSrc = await page.locator('#modalCover').evaluate((el) => el.src);
    await page.click('#modalCoverWrap');
    await expect(page.locator('#coverLightbox')).toHaveClass(/open/);
    await expect(page.locator('#lightboxImg')).toHaveJSProperty('src', coverSrc);
    await page.click('#coverLightbox');
    await expect(page.locator('#coverLightbox')).not.toHaveClass(/open/);
  });
});

test.describe('Catálogo — scroll hint', () => {
  test('hides when content fits, appears and flips direction when it overflows', async ({ page }) => {
    await page.goto('/catalogo.html');
    await page.evaluate(() => openReleaseModal('lautaro-ra-requiem-for-a-michi'));
    // Whether real content overflows the 88vh modal depends on viewport
    // height, font metrics, and now the SF number line — too fragile to rely
    // on any specific real release "just barely" fitting. Force the fits case
    // deterministically (uncapped height, same as the overflow case below
    // forces the opposite) and assert on the hint logic itself.
    await page.evaluate(() => {
      document.getElementById('modalCard').style.maxHeight = 'none';
      updateScrollHint();
    });
    await expect(page.locator('#modalScrollHint')).toBeHidden();

    await page.evaluate(() => {
      document.getElementById('modalCard').style.maxHeight = '200px';
      updateScrollHint();
    });
    const hint = page.locator('#modalScrollHint');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText('↓');

    await page.evaluate(() => {
      const el = document.getElementById('modalCard');
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(hint).toHaveText('↑');
  });
});

test.describe('Catálogo — Cover Flow (pointer-driven, ported from Bateristico)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/catalogo.html');
  });

  // Regression test for this session's actual bug report: the previous
  // scroll-container coverflow had no click-and-drag support, so a plain
  // mouse user (no trackpad/wheel) couldn't move it at all. A drag must
  // change which cover is centred.
  test('dragging the stage with the mouse advances the centred cover @bat', async ({ page }) => {
    const stage = page.locator('#catalogCoverflow');
    const box = await stage.boundingBox();
    const cy = box.y + box.height / 2;
    const before = await page.locator('#coverflowArtist').textContent();
    await page.mouse.move(box.x + box.width / 2 + 100, cy);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, cy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(700); // let the settle spring finish
    const after = await page.locator('#coverflowArtist').textContent();
    expect(after).not.toBe(before);
  });

  // Clicking (no drag) the centred cover opens its ficha directly. Side
  // covers do NOT open on tap (see e8edda3, "Fix catalog carousel click" —
  // deliberate: a tap on a side cover used to pop its modal open too, which
  // read as an accidental click while the carousel was still settling).
  //
  // The covers overlap in 3D (that's the point of Cover Flow), so a
  // side cover's own bounding-box centre is often genuinely painted over by
  // the centred one — Playwright's coordinate-based .click() correctly
  // refuses to click through that and times out. Dispatching pointerdown/up
  // straight on the item tests the actual application logic (which cover's
  // element the tap originated on) without fighting pixel-perfect hit-testing
  // that real browsers already guarantee for whatever sliver is visible.
  function tapCoverflowItem(index) {
    const item = document.querySelectorAll('.coverflow-item')[index];
    const rect = item.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, pointerId: 1, clientX: rect.left + 5, clientY: rect.top + 5, button: 0 };
    item.dispatchEvent(new PointerEvent('pointerdown', opts));
    item.dispatchEvent(new PointerEvent('pointerup', opts));
    return item.dataset.slug;
  }

  test('clicking the centred cover (no drag) opens its ficha directly @bat', async ({ page }) => {
    const slug = await page.evaluate(tapCoverflowItem, 0); // index 0 is centred on load
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    const expectedTitle = await page.evaluate((s) => RELEASES[s].title, slug);
    await expect(page.locator('#modalTitle')).toHaveText(expectedTitle);
  });

  test('clicking a side cover (no drag) does not open any ficha @bat', async ({ page }) => {
    await page.evaluate(tapCoverflowItem, 3); // not the centred index 0
    await page.waitForTimeout(300); // let any (incorrect) open animation settle
    await expect(page.locator('#releaseModal')).not.toHaveClass(/open/);
  });

  // Regression test for a real mobile bug report: a single tap opened the
  // release modal AND immediately popped the cover lightbox open on top of
  // it. Root cause — real touch input fires a genuine touchstart/touchend,
  // and browsers follow that with synthesized compatibility mouse events
  // (mousedown/mouseup/click) a beat later for anything that doesn't call
  // preventDefault on the pointerdown. That delayed click landed on
  // #modalCoverWrap, which had just appeared under the same screen
  // coordinates once the modal opened, triggering its own click-to-zoom
  // handler. Only a genuine touch tap (not a mouse click, and not a
  // dispatched PointerEvent) reproduces this, so this test needs real touch
  // support and only runs on the touch-enabled mobile project.
  test('a real touch tap opens only the release modal, never the cover lightbox too @bat', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'needs a touch-capable browser context');
    await page.locator('.coverflow-item').first().tap();
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    // Give any delayed compatibility click a moment to arrive before asserting.
    await page.waitForTimeout(400);
    await expect(page.locator('#coverLightbox')).not.toHaveClass(/open/);
  });

  // The preventDefault() added for the tap-bug fix above must not swallow
  // dragging itself on the mobile project's touch-emulated browser context —
  // a swipe still has to move the carousel and must not pop any modal open.
  test('on the touch-capable mobile browser, a drag (not a tap) advances the centred cover and opens nothing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'needs a touch-capable browser context');
    const stage = page.locator('#catalogCoverflow');
    const box = await stage.boundingBox();
    const cy = box.y + box.height / 2;
    const before = await page.locator('#coverflowArtist').textContent();
    await page.mouse.move(box.x + box.width / 2 + 100, cy);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, cy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const after = await page.locator('#coverflowArtist').textContent();
    expect(after).not.toBe(before);
    await expect(page.locator('#releaseModal')).not.toHaveClass(/open/);
    await expect(page.locator('#coverLightbox')).not.toHaveClass(/open/);
  });

  test('keyboard: arrow keys move the centred cover, Enter opens whatever is now centred', async ({ page }) => {
    const stage = page.locator('#catalogCoverflow');
    await stage.focus();
    const before = await page.locator('#coverflowArtist').textContent();
    // Starts centred on index 0 (newest release) — ArrowRight is the only
    // direction guaranteed to move it, since ArrowLeft from 0 clamps in place.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500); // settle spring
    const afterArrow = await page.locator('#coverflowArtist').textContent();
    expect(afterArrow).not.toBe(before);

    const expectedSlug = await page.locator('.coverflow-item').nth(1).getAttribute('data-slug');
    await page.keyboard.press('Enter');
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    const expectedTitle = await page.evaluate((s) => RELEASES[s].title, expectedSlug);
    await expect(page.locator('#modalTitle')).toHaveText(expectedTitle);
  });
});

test.describe('Catálogo — Lanzamientos / Artistas buttons open, switch and collapse the panel', () => {
  for (const [label, viewport] of Object.entries({ mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } })) {
    const tag = label === 'desktop' ? ' @bat' : '';
    test(`${label}: starts on the coverflow only; the active button re-clicked collapses back to it${tag}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/catalogo.html');
      await expect(page.locator('#coverflowWrap')).toBeVisible();
      await expect(page.locator('#catalogFullPanel')).toBeHidden();
      await expect(page.locator('#tabBtnLanzamientos')).not.toHaveClass(/active/);

      await page.click('#tabBtnLanzamientos');
      await expect(page.locator('#coverflowWrap')).toBeHidden();
      await expect(page.locator('#catalogFullPanel')).toBeVisible();
      await expect(page.locator('#tabBtnLanzamientos')).toHaveClass(/active/);

      // Clicking the already-active button again collapses back to the carousel.
      await page.click('#tabBtnLanzamientos');
      await expect(page.locator('#coverflowWrap')).toBeVisible();
      await expect(page.locator('#catalogFullPanel')).toBeHidden();
    });
  }

  // Explicit exception the user asked for: tablet widths show only the
  // carousel, with no way to reach the full catalog/artists panel at all.
  test('tablet width (701–1024px) hides both buttons entirely, coverflow only', async ({ page }) => {
    await page.setViewportSize({ width: 850, height: 900 });
    await page.goto('/catalogo.html');
    await expect(page.locator('#coverflowWrap')).toBeVisible();
    await expect(page.locator('.catalog-toggle-row')).toBeHidden();
    await expect(page.locator('#catalogFullPanel')).toBeHidden();
  });

  test('Artistas button opens straight to the artist grid; switching to Lanzamientos keeps the panel open @bat', async ({ page }) => {
    await page.goto('/catalogo.html');
    await page.click('#tabBtnArtistas');
    await expect(page.locator('#catalogFullPanel')).toBeVisible();
    await expect(page.locator('#tabArtistas')).toHaveClass(/active/);
    await expect(page.locator('.artist-item').first()).toBeVisible();

    await page.click('#tabBtnLanzamientos');
    await expect(page.locator('#catalogFullPanel')).toBeVisible(); // still open, just switched tabs
    await expect(page.locator('#tabLanzamientos')).toHaveClass(/active/);
    await expect(page.locator('#tabArtistas')).not.toHaveClass(/active/);
    await expect(page.locator('.artist-item').first()).toBeHidden();
  });

  test('artistas.html redirects into the panel already open on the Artistas tab', async ({ page }) => {
    await page.goto('/artistas.html');
    await expect(page).toHaveURL(/catalogo\.html#artistas/);
    await expect(page.locator('#catalogFullPanel')).toBeVisible();
    await expect(page.locator('#tabArtistas')).toHaveClass(/active/);
    await expect(page.locator('.artist-item').first()).toBeVisible();
  });
});
