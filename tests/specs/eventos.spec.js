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

    const first = page.locator('.flyer-card').first();
    await expect(first.locator('.flyer-cover img')).toBeVisible();
    await expect(first.locator('.flyer-name')).not.toHaveText('');
    await first.click();
    await expect(page.locator('#flyerLightbox')).toHaveClass(/open/);
    await page.click('#flyerLightbox');
    await expect(page.locator('#flyerLightbox')).not.toHaveClass(/open/);
  });
});
