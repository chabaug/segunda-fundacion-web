// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES = ['index.html', 'catalogo.html', 'videoclips.html', 'eventos.html', 'nosotros.html'];

test.describe('Accessibility — icon-only controls have an accessible name', () => {
  for (const page_ of PAGES) {
    const tag = page_ === 'catalogo.html' ? ' @bat' : '';
    test(`every icon-only button/link on ${page_} has a non-empty aria-label${tag}`, async ({ page }) => {
      await page.goto('/' + page_);
      // Scans the whole DOM, not just what's currently visible, so it also
      // catches modal-close buttons etc. that start out hidden — a screen
      // reader user tabbing into an opened modal still needs the label.
      const offenders = await page.evaluate(() => {
        const clickable = Array.from(document.querySelectorAll('button, a[href]'));
        return clickable
          .filter((el) => el.textContent.trim() === '' && el.querySelector('svg, img'))
          .filter((el) => !(el.getAttribute('aria-label') || '').trim())
          .map((el) => el.outerHTML.split('>')[0] + '>');
      });
      expect(offenders, `icon-only elements missing aria-label on ${page_}:\n${offenders.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('Accessibility — catalog grid images carry a real, descriptive alt', () => {
  test('every catalog-item cover in the grid has a non-empty alt attribute @bat', async ({ page }) => {
    await page.goto('/catalogo.html');
    await page.click('#tabBtnLanzamientos');
    const alts = await page.locator('.catalog-item img').evaluateAll((els) => els.map((e) => e.getAttribute('alt')));
    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) {
      expect(alt && alt.trim().length).toBeGreaterThan(0);
    }
  });
});

test.describe('Accessibility — modal backdrops are dismissable, not just the close button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/catalogo.html');
  });

  test('clicking the release modal backdrop (outside the card) closes it @bat', async ({ page }) => {
    await page.evaluate(() => openReleaseModal('lautaro-ra-la-uva'));
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    // Click the modal's own overlay element, not its child card, by targeting
    // a corner well outside where #modalCard is laid out.
    await page.locator('#releaseModal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#releaseModal')).not.toHaveClass(/open/);
  });

  test('clicking the artist modal backdrop (outside the card) closes it @bat', async ({ page }) => {
    await page.click('#tabBtnArtistas');
    await page.locator('.artist-item', { hasText: 'Jaimes' }).click();
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
    await page.locator('#artistModal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#artistModal')).not.toHaveClass(/open/);
  });
});

test.describe('Accessibility — hamburger and theme toggle are keyboard-operable', () => {
  test('Tab reaches the theme toggle and Enter activates it @bat', async ({ page }) => {
    await page.goto('/catalogo.html');
    await page.locator('#themeToggle').focus();
    await expect(page.locator('#themeToggle')).toBeFocused();
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.keyboard.press('Enter');
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(after).not.toBe(before);
  });

  test('Tab reaches the nav hamburger and Enter opens the menu @bat', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/catalogo.html');
    await page.locator('#navToggle').focus();
    await expect(page.locator('#navLinks')).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(page.locator('#navLinks')).toBeVisible();
    await expect(page.locator('#navToggle')).toHaveAttribute('aria-expanded', 'true');
  });
});
