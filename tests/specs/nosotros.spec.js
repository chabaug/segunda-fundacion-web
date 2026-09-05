// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// Recomputes the four stats independently of nosotros.html's own inline
// script, straight from the same data files it reads -- so this actually
// catches drift/bugs in that script instead of just re-asserting whatever
// it happens to output.
function computeExpectedStats() {
  const releasesJs = fs.readFileSync(path.join(ROOT, 'assets', 'releases-data.js'), 'utf-8');
  const releases = JSON.parse(releasesJs.match(/const RELEASES = (\{.*\});/)[1]);
  const artistsJs = fs.readFileSync(path.join(ROOT, 'assets', 'artists-data.js'), 'utf-8');
  const artists = JSON.parse(artistsJs.match(/const ARTISTS = (\[.*\]);/)[1]);

  const slugs = Object.keys(releases);
  let songs = 0;
  let videos = 0;
  for (const slug of slugs) {
    const r = releases[slug];
    songs += (r.tracks || []).length;
    if (r.video) videos += typeof r.video === 'string' ? 1 : Object.keys(r.video).length;
  }
  return { songs, releases: slugs.length, artists: artists.length, videos };
}

test.describe('Nosotros — live stats @bat', () => {
  test('the four stats match a fresh count from releases-data.js / artists-data.js', async ({ page }) => {
    // Sanity check on the fixture data itself: real data currently has both
    // a plain-string video release and an object-shaped multi-video one
    // (LAM's "Samanasatra", two videos) -- if that ever stops being true,
    // this test alone wouldn't catch a broken object-shape branch, so it's
    // asserted directly against the synthetic-data test below instead.
    const expected = computeExpectedStats();

    await page.goto('/nosotros.html');
    await expect(page.locator('#statSongs')).toHaveText(String(expected.songs));
    await expect(page.locator('#statReleases')).toHaveText(String(expected.releases));
    await expect(page.locator('#statArtists')).toHaveText(String(expected.artists));
    await expect(page.locator('#statVideos')).toHaveText(String(expected.videos));
  });

  test('"Videos" counts individual video entries, not releases -- an object-shaped video field with N keys counts as N', async ({ page }) => {
    const synthetic = {
      'single-video': { artist: 'A', title: 'One Video', tracks: ['T1'], video: 'https://youtube.com/watch?v=x' },
      'multi-video': {
        artist: 'B',
        title: 'Two Videos',
        tracks: ['T2a', 'T2b', 'T2c'],
        video: { 'Side A': 'https://youtube.com/watch?v=a', 'Side B': 'https://youtube.com/watch?v=b' },
      },
      'no-video': { artist: 'C', title: 'No Video', tracks: ['T3'] },
    };
    await page.route('**/assets/releases-data.js*', (route) =>
      route.fulfill({ body: 'const RELEASES = ' + JSON.stringify(synthetic) + ';', contentType: 'application/javascript' })
    );
    await page.route('**/assets/artists-data.js*', (route) =>
      route.fulfill({ body: 'const ARTISTS = ' + JSON.stringify([{ slug: 'a' }, { slug: 'b' }]) + ';', contentType: 'application/javascript' })
    );

    await page.goto('/nosotros.html');
    await expect(page.locator('#statSongs')).toHaveText('5'); // 1 + 3 + 1
    await expect(page.locator('#statReleases')).toHaveText('3');
    await expect(page.locator('#statArtists')).toHaveText('2');
    await expect(page.locator('#statVideos')).toHaveText('3'); // 1 + 2 + 0
  });

  test('if the data scripts fail to load, the hand-written fallback numbers stay put instead of showing blank/NaN', async ({ page }) => {
    await page.route('**/assets/releases-data.js*', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('**/assets/artists-data.js*', (route) => route.fulfill({ status: 404, body: '' }));

    await page.goto('/nosotros.html');
    // The inline script's `typeof RELEASES === 'undefined'` guard should
    // bail out entirely, leaving the dd's original hardcoded text.
    await expect(page.locator('#statSongs')).toHaveText('149');
    await expect(page.locator('#statReleases')).toHaveText('61');
    await expect(page.locator('#statArtists')).toHaveText('24');
    await expect(page.locator('#statVideos')).toHaveText('17');
  });
});
