// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Videoclips', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/videoclips.html');
  });

  test('renders at least 17 video cards with thumbnails @bat', async ({ page }) => {
    const cards = page.locator('.video-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(17);
    await expect(cards.first().locator('img')).toBeVisible();
    // Numbered badges on top of the thumbnails were removed by request — the
    // catalog number now only appears inside the release modal.
    await expect(page.locator('.video-number')).toHaveCount(0);
  });

  test('cards have real spacing between them, not edge-to-edge', async ({ page }) => {
    const gap = await page.locator('.video-grid').evaluate((el) => getComputedStyle(el).rowGap);
    expect(parseFloat(gap)).toBeGreaterThan(0);
  });

  test('every card links to a real youtube URL matching its data-yt id', async ({ page }) => {
    const cards = page.locator('.video-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const id = await card.getAttribute('data-yt');
      const href = await card.getAttribute('href');
      expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(href).toContain(id);
    }
  });

  test('clicking a card opens an inline lightbox player instead of navigating away @bat', async ({ page }) => {
    await page.click('.video-card >> nth=0');
    await expect(page.locator('#videoLightbox')).toHaveClass(/open/);
    const src = await page.locator('#videoLightboxFrame').getAttribute('src');
    expect(src).toContain('youtube.com/embed/');
    expect(src).toContain('autoplay=1');
    expect(page.url()).toContain('videoclips.html'); // did not navigate away
  });

  test('closing the lightbox clears the iframe src so playback actually stops', async ({ page }) => {
    await page.click('.video-card >> nth=0');
    await page.click('#videoLightbox', { position: { x: 5, y: 5 } }); // backdrop, not the frame
    await expect(page.locator('#videoLightbox')).not.toHaveClass(/open/);
    const src = await page.locator('#videoLightboxFrame').getAttribute('src');
    expect(src).toBe('');
  });
});
