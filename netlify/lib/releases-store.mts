import { getStore } from "@netlify/blobs";

// "scheduled" = ficha completa y cargada, pero la fecha de lanzamiento
// todavía no llegó — invisible en el sitio público.
// "published" = ya se muestra en Catálogo, en el "Último lanzamiento" de la
// home, y cuenta en las estadísticas de Nosotros.
export type ReleaseStatus = "scheduled" | "published";
export type ReleaseSuffix = "single" | "ep" | "album";

export type StreamingLinks = {
  spotify?: string;
  youtube?: string;
  tidal?: string;
  apple?: string;
  deezer?: string;
  bandcamp?: string;
};

export type SfRelease = {
  slug: string;
  artist: string;
  artistSlug?: string;
  title: string;
  suffix: ReleaseSuffix;
  sfNumber?: number;
  releaseDate: string; // ISO yyyy-mm-dd
  status: ReleaseStatus;
  tracks: string[];
  credits?: string;
  streaming?: StreamingLinks;
  video?: string | Record<string, string>;
  coverKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type SfArtist = {
  slug: string;
  name: string;
  bio?: string;
  instagram?: string | null;
  spotify?: string;
  members: string[];
  photoKey?: string;
  createdAt: string;
  updatedAt: string;
};

const RELEASES_KEY = "all";
const ARTISTS_KEY = "all";

// Same "strong consistency over the default eventual one" call as
// events-store.mts — every write here is a read-modify-write over one
// shared document, and this is a low-traffic single-admin tool where paying
// for strong reads is cheap insurance against the exact lost-write bug that
// bit Eventos in production (see [[project_sf_eventos_admin]]).
export function getReleasesStore() {
  return getStore({ name: "releases", consistency: "strong" });
}

export function getArtistsStore() {
  return getStore({ name: "artists", consistency: "strong" });
}

export function getCoversStore() {
  return getStore({ name: "release-covers", consistency: "strong" });
}

export function getArtistPhotosStore() {
  return getStore({ name: "artist-photos", consistency: "strong" });
}

export async function loadReleases(): Promise<SfRelease[]> {
  const data = await getReleasesStore().get(RELEASES_KEY, { type: "json" });
  return Array.isArray(data) ? (data as SfRelease[]) : [];
}

export async function saveReleases(releases: SfRelease[]): Promise<void> {
  await getReleasesStore().setJSON(RELEASES_KEY, releases);
}

export async function loadArtists(): Promise<SfArtist[]> {
  const data = await getArtistsStore().get(ARTISTS_KEY, { type: "json" });
  return Array.isArray(data) ? (data as SfArtist[]) : [];
}

export async function saveArtists(artists: SfArtist[]): Promise<void> {
  await getArtistsStore().setJSON(ARTISTS_KEY, artists);
}

// An artist profile is only "complete" once it has both a real bio and a
// photo — the two things nothing can auto-generate honestly. This is the
// gate sweepScheduled() checks before publishing a release, per Augusto's
// explicit choice (2026-09-04) to block rather than publish a placeholder
// "ficha próximamente" artist card.
export function isArtistComplete(a: SfArtist | undefined): boolean {
  return !!a && !!a.bio && a.bio.trim().length > 0 && !!a.photoKey;
}

// Publishes any "scheduled" release whose releaseDate has arrived — but
// only if its artist already has a complete profile. A release blocked on
// an incomplete artist stays "scheduled" indefinitely (not silently
// dropped) so it publishes the moment the artist profile is finished,
// whether that's the same day or a week late.
export function sweepScheduled(
  releases: SfRelease[],
  artists: SfArtist[]
): { releases: SfRelease[]; changed: boolean; blocked: SfRelease[] } {
  const todayISO = new Date().toISOString().slice(0, 10);
  const artistsBySlug = new Map(artists.map((a) => [a.slug, a]));
  let changed = false;
  const blocked: SfRelease[] = [];
  const swept = releases.map((r) => {
    if (r.status !== "scheduled" || !r.releaseDate) return r;
    if (r.releaseDate > todayISO) return r; // not due yet
    const artist = r.artistSlug ? artistsBySlug.get(r.artistSlug) : undefined;
    if (!isArtistComplete(artist)) {
      blocked.push(r);
      return r;
    }
    changed = true;
    return { ...r, status: "published" as const, updatedAt: nowISO() };
  });
  return { releases: swept, changed, blocked };
}

export function nowISO(): string {
  return new Date().toISOString();
}

const DIACRITICS_RE = new RegExp("[̀-ͯ]", "g");

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[¡!¿?]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isAuthorized(req: Request): boolean {
  const expected = Netlify.env.get("CATALOG_ADMIN_TOKEN");
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const fromQuery = new URL(req.url).searchParams.get("token") || "";
  return bearer === expected || fromQuery === expected;
}

export function toPublicRelease(r: SfRelease) {
  return {
    slug: r.slug,
    artist: r.artist,
    artistSlug: r.artistSlug || null,
    title: r.title,
    suffix: r.suffix,
    sfNumber: r.sfNumber ?? null,
    date: r.releaseDate,
    tracks: r.tracks || [],
    credits: r.credits || null,
    streaming: r.streaming || {},
    video: r.video || null,
    cover: r.coverKey ? `/api/covers/${r.coverKey}` : null,
  };
}

export function toPublicArtist(a: SfArtist, releases: SfRelease[]) {
  const published = releases.filter((r) => r.status === "published");
  const principal = published
    .filter((r) => r.artistSlug === a.slug)
    .map((r) => ({ slug: r.slug, title: r.title, year: r.releaseDate.slice(0, 4), type: r.suffix }));
  return {
    slug: a.slug,
    name: a.name,
    bio: a.bio || null,
    instagram: a.instagram || null,
    spotify: a.spotify || null,
    members: a.members || [],
    photo: a.photoKey ? `/api/artist-photos/${a.photoKey}` : null,
    principal,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function unauthorizedResponse(): Response {
  return jsonResponse({ error: "unauthorized" }, 401);
}

export function notFoundResponse(): Response {
  return jsonResponse({ error: "not_found" }, 404);
}
