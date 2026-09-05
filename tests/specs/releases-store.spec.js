// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

// releases-store.mts is real ESM+TypeScript (Netlify Functions format), not
// requireable from this CommonJS spec — Node 22+'s built-in type-stripping
// lets a plain dynamic import() load it directly with zero build step, as
// long as the path goes through pathToFileURL first (a raw Windows path
// like "E:\...\foo.mts" is not a valid module specifier on its own).
const STORE_PATH = path.resolve(__dirname, '..', '..', 'netlify', 'lib', 'releases-store.mts');
const loadStore = () => import(pathToFileURL(STORE_PATH).href);

// Deliberately exercises only the pure functions (slugify, isArtistComplete,
// sweepScheduled, toPublicRelease, toPublicArtist) — isAuthorized() reads
// the `Netlify.env` global that only exists inside the real Functions
// runtime, and the getXStore()/load/save helpers hit real Netlify Blobs.
// Those are covered instead by releases-api-live.spec.js, which runs
// against an actual `netlify dev` process.
test.describe('releases-store.mts pure logic @bat', () => {
  test('slugify: lowercases, strips diacritics/punctuation, collapses to dashes', async () => {
    const { slugify } = await loadStore();
    expect(slugify('Radio Mercurio')).toBe('radio-mercurio');
    expect(slugify('¿Sintonía Solar!')).toBe('sintonia-solar');
    expect(slugify('  Comportamiento  ')).toBe('comportamiento');
    expect(slugify('Guido Antonucci, Bocco Ariel')).toBe('guido-antonucci-bocco-ariel');
  });

  test('isArtistComplete: requires both a non-empty bio and a photoKey', async () => {
    const { isArtistComplete } = await loadStore();
    expect(isArtistComplete(undefined)).toBe(false);
    expect(isArtistComplete({ slug: 'a', name: 'A', members: [] })).toBe(false); // neither
    expect(isArtistComplete({ slug: 'a', name: 'A', members: [], bio: '   ' })).toBe(false); // whitespace-only bio
    expect(isArtistComplete({ slug: 'a', name: 'A', members: [], photoKey: 'k' })).toBe(false); // photo but no bio
    expect(isArtistComplete({ slug: 'a', name: 'A', members: [], bio: 'Real bio.' })).toBe(false); // bio but no photo
    expect(isArtistComplete({ slug: 'a', name: 'A', members: [], bio: 'Real bio.', photoKey: 'k' })).toBe(true);
  });

  test('sweepScheduled: a due release only publishes once its artist is complete', async () => {
    const { sweepScheduled } = await loadStore();
    const dueRelease = {
      slug: 'x-y', artist: 'X', artistSlug: 'artist-x', title: 'Y', suffix: 'single',
      releaseDate: '2020-01-01', status: 'scheduled', tracks: ['Y'],
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    };
    const incompleteArtist = { slug: 'artist-x', name: 'X', members: [] };
    const completeArtist = { slug: 'artist-x', name: 'X', members: [], bio: 'Bio.', photoKey: 'k' };

    const withIncomplete = sweepScheduled([dueRelease], [incompleteArtist]);
    expect(withIncomplete.changed).toBe(false);
    expect(withIncomplete.releases[0].status).toBe('scheduled');
    expect(withIncomplete.blocked.map((r) => r.slug)).toEqual(['x-y']);

    const withComplete = sweepScheduled([dueRelease], [completeArtist]);
    expect(withComplete.changed).toBe(true);
    expect(withComplete.releases[0].status).toBe('published');
    expect(withComplete.blocked).toEqual([]);
  });

  test('sweepScheduled: a release with no matching artist at all is blocked, not crashed on', async () => {
    const { sweepScheduled } = await loadStore();
    const orphanRelease = {
      slug: 'orphan', artist: 'Nobody', artistSlug: 'does-not-exist', title: 'T', suffix: 'single',
      releaseDate: '2020-01-01', status: 'scheduled', tracks: ['T'],
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    };
    const { releases, changed, blocked } = sweepScheduled([orphanRelease], []);
    expect(changed).toBe(false);
    expect(releases[0].status).toBe('scheduled');
    expect(blocked.map((r) => r.slug)).toEqual(['orphan']);
  });

  test('sweepScheduled: leaves future-dated and already-published releases untouched', async () => {
    const { sweepScheduled } = await loadStore();
    const future = {
      slug: 'future', artist: 'X', artistSlug: 'artist-x', title: 'F', suffix: 'single',
      releaseDate: '2099-01-01', status: 'scheduled', tracks: ['F'],
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    };
    const alreadyPublished = {
      slug: 'old', artist: 'X', artistSlug: 'artist-x', title: 'O', suffix: 'single',
      releaseDate: '2020-01-01', status: 'published', tracks: ['O'],
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    };
    // No artists at all -- if either of these were mistakenly re-evaluated,
    // they'd show up as blocked or get demoted; asserting the full
    // pass-through (not just "not published"/"not blocked" individually)
    // catches both failure directions.
    const { releases, changed, blocked } = sweepScheduled([future, alreadyPublished], []);
    expect(changed).toBe(false);
    expect(blocked).toEqual([]);
    expect(releases).toEqual([future, alreadyPublished]);
  });

  test('toPublicRelease: strips internal fields, maps coverKey to a URL', async () => {
    const { toPublicRelease } = await loadStore();
    const withCover = toPublicRelease({
      slug: 's', artist: 'A', artistSlug: 'a', title: 'T', suffix: 'ep', sfNumber: 5,
      releaseDate: '2026-01-01', status: 'published', tracks: ['T1', 'T2'],
      coverKey: 'cover-123', createdAt: 'x', updatedAt: 'y',
    });
    expect(withCover.cover).toBe('/api/covers/cover-123');
    expect(withCover.date).toBe('2026-01-01');
    expect(withCover).not.toHaveProperty('coverKey');
    expect(withCover).not.toHaveProperty('status');

    const withoutCover = toPublicRelease({
      slug: 's2', artist: 'A', title: 'T2', suffix: 'single',
      releaseDate: '2026-01-01', status: 'published', tracks: ['T2'],
      createdAt: 'x', updatedAt: 'y',
    });
    expect(withoutCover.cover).toBeNull();
    expect(withoutCover.credits).toBeNull();
    expect(withoutCover.streaming).toEqual({});
  });

  test('toPublicArtist: principal[] only lists this artist\'s PUBLISHED releases', async () => {
    const { toPublicArtist } = await loadStore();
    const artist = { slug: 'a', name: 'A', bio: 'Bio.', photoKey: 'p', members: [] };
    const releases = [
      { slug: 'a-1', artistSlug: 'a', title: 'One', suffix: 'single', releaseDate: '2021-05-01', status: 'published', tracks: ['One'], createdAt: 'x', updatedAt: 'y' },
      { slug: 'a-2', artistSlug: 'a', title: 'Two (still scheduled)', suffix: 'single', releaseDate: '2099-01-01', status: 'scheduled', tracks: ['Two'], createdAt: 'x', updatedAt: 'y' },
      { slug: 'b-1', artistSlug: 'b', title: 'Someone Else', suffix: 'single', releaseDate: '2021-01-01', status: 'published', tracks: ['x'], createdAt: 'x', updatedAt: 'y' },
    ];
    const pub = toPublicArtist(artist, releases);
    expect(pub.photo).toBe('/api/artist-photos/p');
    expect(pub.principal.map((r) => r.slug)).toEqual(['a-1']);
  });
});
