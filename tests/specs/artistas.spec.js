// @ts-check
const { test, expect } = require('@playwright/test');

// Artistas is no longer a standalone page — it's a tab inside Catálogo's
// collapsible panel, opened directly by its own button. This opens straight to it.
async function gotoArtistas(page) {
  await page.goto('/catalogo.html');
  await page.click('#tabBtnArtistas');
}

test.describe('Artistas — no-photo placeholder', () => {
  // Every real artist currently has a photo, so the hasPhoto:false code path
  // is exercised with a synthetic artist mocked in over the real data file —
  // same pattern as ticket-banner.spec.js does for the Eventos API route.
  const NO_PHOTO_ARTIST = {
    slug: 'placeholder-test-artist',
    name: 'Placeholder Testeitor',
    hasPhoto: false,
    instagram: null,
    principal: [],
    appearsIn: [],
  };

  test.beforeEach(async ({ page }) => {
    await page.route('**/assets/artists-data.js*', (route) =>
      route.fulfill({ body: 'const ARTISTS = ' + JSON.stringify([NO_PHOTO_ARTIST]) + ';', contentType: 'application/javascript' })
    );
    await gotoArtistas(page);
  });

  test('renders the placeholder initial in the grid instead of a broken image', async ({ page }) => {
    const card = page.locator('.artist-item', { hasText: 'Placeholder Testeitor' });
    const placeholder = card.locator('.artist-photo.placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toHaveText('P');
    await expect(card.locator('img')).toHaveCount(0);
  });

  test('renders the placeholder initial in the modal too', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Placeholder Testeitor' }).click();
    await expect(page.locator('#artistModalPhotoWrap')).toHaveClass(/placeholder/);
    await expect(page.locator('#artistModalPhotoWrap')).toHaveText('P');
  });
});

test.describe('Artistas — grid', () => {
  test.beforeEach(async ({ page }) => {
    await gotoArtistas(page);
  });

  test('grid renders 24 artist cards @bat', async ({ page }) => {
    await expect(page.locator('.artist-item')).toHaveCount(24);
  });

  test('artists with a photo render an img, not the placeholder', async ({ page }) => {
    const card = page.locator('.artist-item', { hasText: 'Guido Antonucci' });
    await expect(card.locator('.artist-photo.placeholder')).toHaveCount(0);
    await expect(card.locator('img')).toHaveAttribute('src', 'assets/artists/guido-antonucci.webp');
  });
});

test.describe('Artistas — modal', () => {
  test.beforeEach(async ({ page }) => {
    await gotoArtistas(page);
  });

  test('clicking a card opens the modal with that artist\'s name and photo @bat', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Jaimes' }).click();
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
    await expect(page.locator('#artistModalName')).toHaveText('Jaimes');
    await expect(page.locator('#artistModalPhotoWrap img')).toHaveAttribute('src', 'assets/artists/jaimes.webp');
  });

  test('no bio section is shown (feature deferred, not shipped half-done)', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Bruxx' }).click();
    await expect(page.locator('#artistModal .modal-label', { hasText: 'Biografía' })).toHaveCount(0);
  });

  test('Catálogo principal lists every solo release for a single-artist act', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Tinachown' }).click();
    await expect(page.locator('#artistPrincipalSection')).toBeVisible();
    await expect(page.locator('#artistPrincipalList .artist-release-row')).toHaveCount(1);
    await expect(page.locator('#artistPrincipalList .artist-release-title')).toHaveText('Estudio T');
    // Tinachown never appears as a guest on someone else's release.
    await expect(page.locator('#artistAppearsSection')).toBeHidden();
  });

  test('También aparece en shows guest releases with their co-artists listed', async ({ page }) => {
    // Ramiro Vecchio: guest on Historia de la Eternidad (auto, artist-field collab),
    // plus Soles and both LAM releases (manual, real-credits guest additions).
    await page.locator('.artist-item', { hasText: 'Ramiro Vecchio' }).click();
    await expect(page.locator('#artistAppearsSection')).toBeVisible();
    await expect(page.locator('#artistAppearsList .artist-release-row')).toHaveCount(4);
    const titles = await page.locator('#artistAppearsList .artist-release-title').allTextContents();
    expect(titles.sort()).toEqual(['Historia de la Eternidad', 'Samanasatra', 'Soles', 'Trepanación'].sort());
    await expect(page.locator('#artistAppearsList .artist-release-sub').first()).toContainText('junto a');
  });

  test('a collab-only release does not pollute a collaborator\'s Catálogo principal', async ({ page }) => {
    // Patricio Díaz has 2 solo releases; everything else (his own How Deep Is
    // Your Love collab-field credit, plus his real membership across all 4
    // Quintacolumna releases, added manually from verified liner-note credits)
    // must land in "También aparece en" only, never in Catálogo principal.
    await page.locator('.artist-item', { hasText: 'Patricio Díaz' }).click();
    await expect(page.locator('#artistPrincipalList .artist-release-row')).toHaveCount(2);
    await expect(page.locator('#artistAppearsList .artist-release-row')).toHaveCount(5);
    const titles = await page.locator('#artistAppearsList .artist-release-title').allTextContents();
    expect(titles).toContain('How Deep Is Your Love');
    expect(titles).toContain('Quintacolumna');
    expect(titles).toContain('Traer del Mañana');
  });

  test('guest-membership credits are cross-referenced even when the artist field never names the guest (Guido Antonucci in LHDM/Quintacolumna)', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Guido Antonucci' }).click();
    const titles = await page.locator('#artistAppearsList .artist-release-title').allTextContents();
    expect(titles).toContain('El Sega');
    expect(titles).toContain('Todo Pasa');
    expect(titles).toContain('Traer del Mañana');
    expect(titles).toContain('Quintacolumna');
  });

  test('Comportamiento (Augusto Nasso) and REGIREXX both show up as LHDM guests', async ({ page }) => {
    for (const name of ['Comportamiento', 'REGIREXX']) {
      await page.locator('.artist-item', { hasText: name }).click();
      const titles = await page.locator('#artistAppearsList .artist-release-title').allTextContents();
      expect(titles, `${name} should appear on LHDM's El Sega`).toContain('El Sega');
      expect(titles, `${name} should appear on LHDM's Todo Pasa`).toContain('Todo Pasa');
      await page.click('#artistModal .modal-close');
    }
  });

  test('excluded collaborators (e.g. Larilium, Juampi Diaz) never get their own card', async ({ page }) => {
    const names = await page.locator('.artist-name').allTextContents();
    for (const excluded of ['Ignacio Kater', 'Un Pasillo', 'Nus Tremendu', 'Ariel Bocco', 'VANINA', 'BABY TITA', 'Iván Ariel Sierra', 'Larilium', 'Juampi Diaz']) {
      expect(names, `${excluded} should not have its own artist card`).not.toContain(excluded);
    }
  });

  test('closing the modal via the close button removes the open class', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Shigella' }).click();
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
    await page.click('#artistModal .modal-close');
    await expect(page.locator('#artistModal')).not.toHaveClass(/open/);
  });
});

test.describe('Artistas — Instagram and Spotify buttons', () => {
  test.beforeEach(async ({ page }) => {
    await gotoArtistas(page);
  });

  test('Instagram button is an icon (no visible text) and links to the confirmed handle', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Guido Antonucci' }).click();
    const ig = page.locator('#artistModalInstagram');
    await expect(ig).toBeVisible();
    await expect(ig).toHaveAttribute('href', 'https://instagram.com/guidoruido');
    await expect(ig).toHaveAttribute('target', '_blank');
    await expect(ig).toHaveText('');
    await expect(ig.locator('svg')).toHaveCount(1);
  });

  test('Instagram button is hidden for an artist with no confirmed handle', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Futuribles' }).click();
    await expect(page.locator('#artistModalInstagram')).toBeHidden();
  });

  test('Spotify button uses the confirmed artist profile URL when one exists', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Guido Antonucci' }).click();
    const sp = page.locator('#artistModalSpotify');
    await expect(sp).toBeVisible();
    await expect(sp).toHaveAttribute('href', 'https://open.spotify.com/artist/6QodprvUDiHF41fBkxeuTn');
    await expect(sp.locator('svg')).toHaveCount(1);
  });

  test('Spotify button falls back to a search URL when no confirmed artist profile exists', async ({ page }) => {
    // Every real artist has a confirmed Spotify profile as of 2026-08-28, so
    // exercise the fallback path with a mocked artist, same pattern as the
    // no-photo-placeholder tests above.
    await page.route('**/assets/artists-data.js*', (route) =>
      route.fulfill({
        body: 'const ARTISTS = ' + JSON.stringify([{
          slug: 'no-spotify-test-artist', name: 'Sin Spotify Testeitor', hasPhoto: false,
          instagram: null, spotify: null, members: [], principal: [], appearsIn: [],
        }]) + ';',
        contentType: 'application/javascript',
      })
    );
    await gotoArtistas(page);
    await page.locator('.artist-item', { hasText: 'Sin Spotify Testeitor' }).click();
    await expect(page.locator('#artistModalSpotify')).toHaveAttribute('href', 'https://open.spotify.com/search/Sin%20Spotify%20Testeitor');
  });
});

test.describe('Artistas — band members', () => {
  test.beforeEach(async ({ page }) => {
    await gotoArtistas(page);
  });

  test('a real band shows its member names', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'La Hora del Mosquito' }).click();
    const members = page.locator('#artistModalMembers');
    await expect(members).toBeVisible();
    await expect(members).toContainText('Pablo Caballero');
    await expect(members).toContainText('Vanina Jara');
    // Listed by her real name here, not her REGIREXX stage name — that stays
    // reserved for her own "Do U?" release and its own artist card.
    await expect(members).toContainText('Regina Nasso');
    await expect(members).not.toContainText('REGIREXX');
  });

  test('a solo act shows no members line', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Ramiro Vecchio' }).click();
    await expect(page.locator('#artistModalMembers')).toBeHidden();
  });

  test('Quintacolumna and Comportamiento are treated as solo pseudonyms, not bands (no members line)', async ({ page }) => {
    for (const name of ['Quintacolumna', 'Comportamiento']) {
      await page.locator('.artist-item', { hasText: name }).click();
      await expect(page.locator('#artistModalMembers'), `${name} should have no members line`).toBeHidden();
      await page.click('#artistModal .modal-close');
    }
  });
});

test.describe('Artistas — release modal integration', () => {
  test.beforeEach(async ({ page }) => {
    await gotoArtistas(page);
  });

  test('clicking a release row opens the same release modal used on Catálogo, on top of the artist modal @bat', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Tinachown' }).click();
    await page.click('#artistPrincipalList .artist-release-row');
    await expect(page.locator('#releaseModal')).toHaveClass(/open/);
    await expect(page.locator('#modalArtist')).toHaveText('Tinachown');
    await expect(page.locator('#modalTitle')).toHaveText('Estudio T');
    // The artist modal must still be open underneath, not closed.
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
  });

  test('closing the release modal returns to the artist modal, not the bare page', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Tinachown' }).click();
    await page.click('#artistPrincipalList .artist-release-row');
    await page.click('#releaseModal .modal-close');
    await expect(page.locator('#releaseModal')).not.toHaveClass(/open/);
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
    // Scroll must still be locked — the artist modal is still open.
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });

  test('Escape closes the release modal first, then the artist modal on a second press', async ({ page }) => {
    await page.locator('.artist-item', { hasText: 'Tinachown' }).click();
    await page.click('#artistPrincipalList .artist-release-row');
    await page.keyboard.press('Escape');
    await expect(page.locator('#releaseModal')).not.toHaveClass(/open/);
    await expect(page.locator('#artistModal')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#artistModal')).not.toHaveClass(/open/);
  });
});
