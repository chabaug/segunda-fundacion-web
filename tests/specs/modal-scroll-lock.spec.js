// @ts-check
const { test, expect } = require('@playwright/test');

// Regression test for a real bug: the artist/release modals share a page-
// scroll lock (set overflow:hidden on <html>/<body> while any of them is
// open). It used to be a plain increment/decrement counter, incremented on
// every openArtistModal/openReleaseModal call and decremented once per
// close. But several navigation paths open a modal that's already open (or
// open a second modal on top) without closing the first — hopping between
// artists via a bio link re-renders the same artist modal in place with a
// fresh openArtistModal call, and clicking a release row inside the artist
// modal opens the release modal without closing the artist modal first.
// Chaining a few of those before finally closing kept incrementing the
// counter, so a single real close never brought it back to zero and the
// page stayed scroll-locked forever. Fixed by tracking which modal *types*
// are open in a Set instead of a counter, so re-opening an already-open
// modal is a no-op rather than another increment.

async function isScrollLocked(page) {
  return page.evaluate(() => document.body.style.overflow === 'hidden');
}

test.describe('Catalogo modals — scroll lock', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/catalogo.html');
    await page.click('#tabBtnArtistas');
  });

  test('closing after hopping between artists via bio links fully unlocks scroll @bat', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Lautaro Rá' }).click();
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
    expect(await isScrollLocked(page)).toBe(true);

    // Hop to a different artist via a bio link — re-renders the same modal
    // in place, no close in between.
    const bioLink = page.locator('#artistModalBio .bio-link[data-type="artist"]').first();
    const targetSlug = await bioLink.getAttribute('data-slug');
    await bioLink.click();
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
    await expect(page.locator('#artistModalPhotoWrap img')).toHaveAttribute('src', `assets/artists/${targetSlug}.webp`);

    // Close the only modal that's open.
    await page.click('#artistModal .modal-close');
    await expect(page.locator('#artistModal')).not.toHaveClass(/open/);

    expect(await isScrollLocked(page)).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 200));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('closing a release opened from inside the artist modal, then the artist modal, fully unlocks scroll @bat', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Guido Antonucci' }).click();
    await expect(page.locator('#artistModal')).toHaveClass(/open/);

    // A release row inside the artist modal opens the release modal without
    // closing the artist modal first — the artist modal is still open
    // underneath.
    await page.locator('#artistAppearsList .artist-release-row').first().click();
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
    expect(await isScrollLocked(page)).toBe(true);

    await page.click('#releaseModal .modal-close');
    await expect(page.locator('#releaseModal')).not.toHaveClass(/open/);
    // The artist modal is still open behind it — scroll must stay locked.
    expect(await isScrollLocked(page)).toBe(true);

    await page.click('#artistModal .modal-close');
    await expect(page.locator('#artistModal')).not.toHaveClass(/open/);

    expect(await isScrollLocked(page)).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 200));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});
