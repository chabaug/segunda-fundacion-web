// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Eventos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/eventos.html');
  });

  test('Próximos shows: empty-state message and populated grid are mutually exclusive', async ({ page }) => {
    // Fiebre Lunar Vol. 2 and Presentación de UGAM are paused in
    // assets/events-data.js until a Passline link exists, so this asserts
    // the same invariant as the past-events grid rather than a fixed count.
    const emptyVisible = await page.locator('#upcomingEmpty').isVisible();
    const cardCount = await page.locator('.event-card').count();
    if (emptyVisible) {
      expect(cardCount).toBe(0);
    } else {
      expect(cardCount).toBeGreaterThan(0);
    }
  });

  test('an upcoming show with a real ticket link renders an active button instead of "próximamente"', async ({ page }) => {
    // Regression guard for the day a ticket link gets added: whichever cards
    // are NOT pending must be real, clickable, new-tab links.
    const activeLinks = page.locator('.event-tickets-active');
    const count = await activeLinks.count();
    for (let i = 0; i < count; i++) {
      const el = activeLinks.nth(i);
      expect(await el.evaluate((e) => e.tagName)).toBe('A');
      expect(await el.getAttribute('href')).toMatch(/^https:\/\//);
      expect(await el.getAttribute('target')).toBe('_blank');
    }
  });

  test('past-events grid: empty-state message and populated grid are mutually exclusive @bat', async ({ page }) => {
    // The page fetches assets/flyers/_events.json at runtime; this may or may
    // not exist depending on when the flyer-extraction pass has landed, so
    // assert the invariant rather than one fixed outcome.
    await page.waitForTimeout(300); // let the fetch/render microtask settle
    const emptyVisible = await page.locator('#pastEventsEmpty').isVisible();
    const cardCount = await page.locator('.flyer-card').count();
    if (emptyVisible) {
      expect(cardCount).toBe(0);
    } else {
      expect(cardCount).toBeGreaterThan(0);
    }
  });

  test('if past-show flyers are present, each has an image, name, date and opens a lightbox @bat', async ({ page }) => {
    await page.waitForTimeout(300);
    const cardCount = await page.locator('.flyer-card').count();
    test.skip(cardCount === 0, 'no flyer data published yet');

    // On mobile, with an active event, past shows start collapsed behind a
    // toggle button — expand it before asserting on the (now-visible) grid.
    const toggle = page.locator('#pastEventsToggleBtn');
    if (await toggle.isVisible()) await toggle.click();

    const first = page.locator('.flyer-card').first();
    await expect(first.locator('.flyer-cover img')).toBeVisible();
    await expect(first.locator('.flyer-name')).not.toHaveText('');
    await first.click();
    await expect(page.locator('#flyerLightbox')).toHaveClass(/open/);
    await page.click('#flyerLightbox');
    await expect(page.locator('#flyerLightbox')).not.toHaveClass(/open/);
  });
});

test.describe('Eventos — event modal', () => {
  const FIEBRE = {
    name: 'Fiebre Lunar Vol. 2',
    date: '2026-10-03',
    dateLabel: 'Sábado 3 de octubre, 2026',
    venue: 'Quetrén Club Cultural',
    venueAddress: 'Av. Olazábal 1784, CABA',
    venueInstagram: 'https://instagram.com/quetren.club',
    lineup: 'Radio Mercurio, Lu Kompel, Emi Esparza + DJs',
    ticketUrl: 'https://passline.com/eventos/fiebre-lunar-vol-2',
    flyer: 'assets/flyers/radiomercurio-fiebrelunar-laquince.jpg',
    description: null,
  };

  test.beforeEach(async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({
        body: 'const UPCOMING_EVENTS = ' + JSON.stringify([FIEBRE]) + ';',
        contentType: 'application/javascript',
      })
    );
    await page.goto('/eventos.html');
  });

  test('card shows a "ver evento" hint and opens the modal with the event\'s info @bat', async ({ page }) => {
    const card = page.locator('.event-card').first();
    await expect(card.locator('.event-view-hint')).toHaveText('Ver evento →');

    await card.click();
    const modal = page.locator('#eventModal');
    await expect(modal).toHaveClass(/open/);
    await expect(page.locator('#eventModalTitle')).toHaveText(FIEBRE.name);
    await expect(page.locator('#eventModalDate')).toHaveText(FIEBRE.dateLabel);
    await expect(page.locator('#eventModalVenueName')).toHaveText(FIEBRE.venue);
    await expect(page.locator('#eventModalVenueName')).toHaveAttribute('href', FIEBRE.venueInstagram);
    await expect(page.locator('#eventModalAddressLink')).toHaveText(FIEBRE.venueAddress + ' (Ver ubicación)');
    await expect(page.locator('#eventModalDescription')).toHaveText(FIEBRE.lineup); // falls back to lineup
    await expect(page.locator('#eventModalCover')).toBeVisible();

    const mapsHref = await page.locator('#eventModalAddressLink').getAttribute('href');
    expect(mapsHref).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(FIEBRE.venue + ', ' + FIEBRE.venueAddress));

    const buyLink = page.locator('#eventModalBuyLink');
    await expect(buyLink).toBeVisible();
    await expect(buyLink).toHaveAttribute('href', FIEBRE.ticketUrl);
    await expect(buyLink).toHaveCSS('text-transform', 'uppercase');
  });

  test('closes on backdrop click and on Escape', async ({ page }) => {
    await page.locator('.event-card').first().click();
    const modal = page.locator('#eventModal');
    await expect(modal).toHaveClass(/open/);

    await modal.click({ position: { x: 4, y: 4 } }); // outside the card, on the backdrop
    await expect(modal).not.toHaveClass(/open/);

    await page.locator('.event-card').first().click();
    await expect(modal).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/open/);
  });

  test('clicking "Comprar entradas" on the card opens a new tab for the ticket link, not the modal', async ({ page }) => {
    // Checks the link's own target/href statically rather than the popup's
    // eventual url() — passline.com is a real external domain the test
    // sandbox can't actually reach, so waiting on that navigation to land
    // would be flaky. Confirming the popup event fires (proof target=_blank
    // really opened a new tab) plus the static attributes covers the same
    // behavior deterministically.
    const link = page.locator('.event-tickets-active').first();
    await expect(link).toHaveAttribute('href', FIEBRE.ticketUrl);
    await expect(link).toHaveAttribute('target', '_blank');
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      link.click(),
    ]);
    expect(popup).toBeTruthy();
    await expect(page.locator('#eventModal')).not.toHaveClass(/open/);
  });

  test('the "Shows anteriores" title doubles as a collapse toggle on mobile, but not on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const toggle = page.locator('#pastEventsToggleBtn');
    const arrow = page.locator('.events-toggle-arrow');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Shows anteriores'); // arrow is part of the same button
    await expect(arrow).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#pastEventsBody')).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(arrow).toHaveCSS('transform', /matrix/); // rotated 180deg, not the identity matrix
    await expect(page.locator('#pastEventsBody')).toBeVisible();

    // Desktop: same title, but it's not a functional toggle — no visible
    // arrow, and Shows anteriores is never hidden in the first place.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(page.locator('#pastEventsToggleBtn')).toBeVisible();
    await expect(arrow).toBeHidden();
    await expect(page.locator('#pastEventsBody')).toBeVisible();
  });

  test('"Shows anteriores" matches the plain "Próximos shows" title\'s font exactly', async ({ page }) => {
    // Regression guard: .events-toggle-btn's reset once used `font:inherit`,
    // which also resets font-size/font-weight (they're part of the font
    // shorthand) and silently overrode .section-title's 13px/700 — making
    // this title render smaller/thinner than the one right above it.
    const fontOf = (loc) =>
      loc.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          letterSpacing: s.letterSpacing,
          textTransform: s.textTransform,
          color: s.color,
        };
      });
    // "Próximos shows" is the first .section-title in document order.
    const proximos = await fontOf(page.locator('.section-title').first());
    const anteriores = await fontOf(page.locator('#pastEventsToggleBtn'));
    expect(anteriores).toEqual(proximos);
  });

  test('event card flyer never overflows the viewport, even on a very narrow phone', async ({ page }) => {
    // Regression guard: .upcoming-grid's minmax(360px, 1fr) used to force
    // every card to be at least 360px wide regardless of how much room was
    // actually available, overflowing the card off the right edge on any
    // phone narrower than ~408px.
    await page.setViewportSize({ width: 320, height: 700 });
    await page.reload();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);

    const card = await page.locator('.event-card').first().boundingBox();
    expect(card.x + card.width).toBeLessThanOrEqual(320);
  });

  test('event card flyer is 16:9 on mobile, and fills the row with no dead space on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const mobileCover = await page.locator('.event-card-cover').boundingBox();
    expect(mobileCover.width / mobileCover.height).toBeCloseTo(16 / 9, 1);

    // Desktop: image left / info right. The cover has no fixed aspect ratio
    // here — it stretches to match the info column's height exactly, so a
    // short flyer never leaves empty background space below it.
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.reload();
    const cover = await page.locator('.event-card-cover').boundingBox();
    const main = await page.locator('.event-card-main').boundingBox();
    expect(Math.abs(cover.height - main.height)).toBeLessThan(1);
  });

  test('event card flyer height is capped so the whole card fits a short mobile screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 600 });
    await page.reload();
    const cover = await page.locator('.event-card-cover').boundingBox();
    expect(cover.height).toBeLessThanOrEqual(600 * 0.34 + 1);
  });

  test('event modal flyer is complete/uncropped on desktop, sized to its own aspect ratio', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.reload();
    await page.locator('.event-card').first().click();
    const cover = await page.locator('.event-modal-cover').boundingBox();
    const img = await page.locator('#eventModalCover').boundingBox();
    // The image fills its column exactly — no letterboxed background around
    // it — because the column's own width is derived from the image's
    // aspect ratio rather than forced into a fixed box.
    expect(Math.abs(cover.width - img.width)).toBeLessThan(1);
    expect(Math.abs(cover.height - img.height)).toBeLessThan(1);
  });
});
