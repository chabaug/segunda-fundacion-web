// @ts-check
const { test, expect } = require('@playwright/test');

function eventsScript(events) {
  return 'const UPCOMING_EVENTS = ' + JSON.stringify(events) + ';';
}

const FIEBRE = {
  name: 'Fiebre Lunar Vol. 2',
  date: '2026-10-03',
  dateLabel: 'Sábado 3 de octubre, 2026',
  venue: 'Quetrén Club Cultural',
  lineup: 'Radio Mercurio, Lu Kompel, Emi Esparza + DJs',
  ticketUrl: null,
};

const UGAM = {
  name: 'Presentación de UGAM',
  date: '2026-10-28',
  dateLabel: 'Miércoles 28 de octubre, 2026',
  venue: 'La Tangente',
  lineup: 'Lautaro Rá',
  ticketUrl: null,
};

test.describe('Home page — ticket banner', () => {
  test('stays hidden when no upcoming event has a ticket link', async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({ body: eventsScript([FIEBRE, UGAM]), contentType: 'application/javascript' })
    );
    await page.goto('/segunda-fundacion.html');
    await expect(page.locator('#ticketBanner')).not.toHaveClass(/show/);
    await expect(page.locator('#ticketBanner')).toBeHidden();
  });

  test('shows the single event name and links straight to its ticket URL when only one is active @bat', async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({
        body: eventsScript([FIEBRE, { ...UGAM, ticketUrl: 'https://passline.com/eventos/ugam-real' }]),
        contentType: 'application/javascript',
      })
    );
    await page.goto('/segunda-fundacion.html');
    const banner = page.locator('#ticketBanner');
    await expect(banner).toHaveClass(/show/);
    await expect(banner).toBeVisible();
    await expect(banner.locator('.ticket-banner-text').first()).toHaveText('Entradas para Presentación de UGAM');
    await expect(banner).toHaveAttribute('href', 'https://passline.com/eventos/ugam-real');
    await expect(banner).toHaveAttribute('target', '_blank');
  });

  test('concatenates names soonest-first and links to Eventos when more than one is active', async ({ page }) => {
    // Deliberately declared out of date order to prove the banner sorts by
    // date rather than trusting array order.
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({
        body: eventsScript([
          { ...UGAM, ticketUrl: 'https://passline.com/eventos/ugam-real' },
          { ...FIEBRE, ticketUrl: 'https://passline.com/eventos/fiebre-real' },
        ]),
        contentType: 'application/javascript',
      })
    );
    await page.goto('/segunda-fundacion.html');
    const banner = page.locator('#ticketBanner');
    await expect(banner).toHaveClass(/show/);
    await expect(banner.locator('.ticket-banner-text').first()).toHaveText(
      'Entradas para Fiebre Lunar Vol. 2   ·   Entradas para Presentación de UGAM'
    );
    await expect(banner).toHaveAttribute('href', /eventos\.html$/);
  });

  test('renders two identical, container-filling groups for a seamless marquee loop, with a positive animation duration', async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({
        body: eventsScript([{ ...FIEBRE, ticketUrl: 'https://passline.com/x' }]),
        contentType: 'application/javascript',
      })
    );
    await page.goto('/segunda-fundacion.html');

    // Exactly 2 groups (for the translateX(-50%) loop trick), each repeated
    // enough times internally to fully cover the banner's own width.
    const groups = page.locator('#ticketBannerTrack .ticket-banner-group');
    await expect(groups).toHaveCount(2);
    const [group1Text, group2Text] = await groups.allTextContents();
    expect(group1Text).toBe(group2Text);
    expect(group1Text.length).toBeGreaterThan(0);

    const bannerWidth = await page.locator('#ticketBanner').evaluate((el) => el.getBoundingClientRect().width);
    const groupWidth = await groups.first().evaluate((el) => el.getBoundingClientRect().width);
    expect(groupWidth).toBeGreaterThanOrEqual(bannerWidth);

    const duration = await page.locator('#ticketBannerTrack').evaluate((el) => parseFloat(el.style.animationDuration));
    expect(duration).toBeGreaterThan(0);
  });

  test('banner text renders in white for legibility against the highlight background', async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({
        body: eventsScript([{ ...FIEBRE, ticketUrl: 'https://passline.com/x' }]),
        contentType: 'application/javascript',
      })
    );
    await page.goto('/segunda-fundacion.html');
    const color = await page.locator('.ticket-banner-text').first().evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(255, 255, 255)');
  });
});

test.describe('Ticket banner — present everywhere except Eventos', () => {
  test('renders on every other real page @bat', async ({ page }) => {
    for (const path of ['/segunda-fundacion.html', '/catalogo.html', '/videoclips.html', '/nosotros.html']) {
      await page.goto(path);
      await expect(page.locator('#ticketBanner')).toHaveCount(1);
    }
  });

  test('is absent on eventos.html, which already lists the same info as full cards', async ({ page }) => {
    await page.goto('/eventos.html');
    await expect(page.locator('#ticketBanner')).toHaveCount(0);
  });
});

test.describe('Nav — Eventos link shine when a ticket is active', () => {
  test('stays plain when no upcoming event has a ticket link', async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({ body: eventsScript([FIEBRE, UGAM]), contentType: 'application/javascript' })
    );
    await page.goto('/catalogo.html');
    await expect(page.locator('.nav-links a[href="eventos.html"]')).not.toHaveClass(/event-live/);
  });

  test('gets the shine class on every page once an event has a ticket link @bat', async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({
        body: eventsScript([{ ...FIEBRE, ticketUrl: 'https://passline.com/x' }]),
        contentType: 'application/javascript',
      })
    );
    await page.goto('/catalogo.html');
    await expect(page.locator('.nav-links a[href="eventos.html"]')).toHaveClass(/event-live/);
  });

  test('desktop: the shine is clipped to the letters, not a bar sliding over the whole link', async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({
        body: eventsScript([{ ...FIEBRE, ticketUrl: 'https://passline.com/x' }]),
        contentType: 'application/javascript',
      })
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/catalogo.html');
    const link = page.locator('.nav-links a[href="eventos.html"]');
    const cs = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        backgroundClip: s.webkitBackgroundClip || s.backgroundClip,
        textFillColor: s.webkitTextFillColor,
        animationName: s.animationName,
      };
    });
    // background-clip:text + a transparent text fill is what makes the
    // gradient only paint inside the glyph shapes instead of a rectangle
    // over the link's whole box.
    expect(cs.backgroundClip).toBe('text');
    expect(cs.textFillColor).toBe('rgba(0, 0, 0, 0)');
    expect(cs.animationName).toBe('nav-shine');
  });

  test('mobile: the shine is a constant solid color instead of the sweep', async ({ page }) => {
    await page.route('**/assets/events-data.js*', (route) =>
      route.fulfill({
        body: eventsScript([{ ...FIEBRE, ticketUrl: 'https://passline.com/x' }]),
        contentType: 'application/javascript',
      })
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/catalogo.html');
    await page.locator('#navToggle').click();
    const link = page.locator('.nav-links a[href="eventos.html"]');

    const matchesAccentFluor = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent-fluor)';
      document.body.appendChild(probe);
      const expected = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      const real = getComputedStyle(document.querySelector('.nav-links a[href="eventos.html"]')).color;
      return expected === real;
    });
    expect(matchesAccentFluor).toBe(true);

    const cs = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return { animationName: s.animationName, backgroundImage: s.backgroundImage };
    });
    expect(cs.animationName).toBe('none');
    expect(cs.backgroundImage).toBe('none');
  });
});

test.describe('Header wordmark on narrow viewports', () => {
  test('shows icon + text on desktop, icon only below the nav breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/catalogo.html');
    await expect(page.locator('.wordmark-text')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.wordmark-text')).toBeHidden();
    await expect(page.locator('.wordmark .icon')).toBeVisible();
  });
});
