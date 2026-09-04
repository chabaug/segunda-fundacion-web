import type { Context, Config } from "@netlify/functions";
import {
  loadArtists,
  saveArtists,
  loadReleases,
  isAuthorized,
  slugify,
  nowISO,
  toPublicArtist,
  jsonResponse,
  unauthorizedResponse,
  notFoundResponse,
  type SfArtist,
} from "../lib/releases-store.mts";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","artists", slug?]
  const slug = parts[2];

  const artists = await loadArtists();

  // GET /api/artists         -> public shape, cross-referenced with releases
  // GET /api/artists?admin=1 -> requires token, raw records (for editing —
  //                             includes bio/photoKey presence so the admin
  //                             panel can flag incomplete profiles)
  if (req.method === "GET" && !slug) {
    const isAdmin = url.searchParams.get("admin") === "1";
    if (isAdmin) {
      if (!isAuthorized(req)) return unauthorizedResponse();
      return jsonResponse(artists);
    }
    const releases = await loadReleases();
    return jsonResponse(artists.map((a) => toPublicArtist(a, releases)));
  }

  // POST /api/artists -> create
  if (req.method === "POST" && !slug) {
    if (!isAuthorized(req)) return unauthorizedResponse();
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return jsonResponse({ error: "name is required" }, 400);
    let newSlug = slugify(name);
    let suffix = 2;
    while (artists.some((a) => a.slug === newSlug)) {
      newSlug = slugify(name) + "-" + suffix++;
    }
    const now = nowISO();
    const artist: SfArtist = {
      slug: newSlug,
      name,
      bio: body.bio || undefined,
      instagram: body.instagram || null,
      spotify: body.spotify || undefined,
      members: Array.isArray(body.members) ? body.members : [],
      photoKey: undefined,
      createdAt: now,
      updatedAt: now,
    };
    artists.push(artist);
    await saveArtists(artists);
    return jsonResponse(artist, 201);
  }

  if (!slug) return notFoundResponse();
  const artist = artists.find((a) => a.slug === slug);

  // PATCH /api/artists/:slug -> edit fields (bio/photo completeness lives
  // here — a release for this artist can't publish until both are set, see
  // isArtistComplete() in releases-store.mts)
  if (req.method === "PATCH") {
    if (!isAuthorized(req)) return unauthorizedResponse();
    if (!artist) return notFoundResponse();
    const body = await req.json().catch(() => ({}));
    const patchable: (keyof SfArtist)[] = ["name", "bio", "instagram", "spotify", "members"];
    for (const key of patchable) {
      if (key in body) (artist as any)[key] = body[key];
    }
    artist.updatedAt = nowISO();
    await saveArtists(artists);
    return jsonResponse(artist);
  }

  // DELETE /api/artists/:slug
  if (req.method === "DELETE") {
    if (!isAuthorized(req)) return unauthorizedResponse();
    if (!artist) return notFoundResponse();
    const remaining = artists.filter((a) => a.slug !== slug);
    await saveArtists(remaining);
    return new Response(null, { status: 204 });
  }

  return notFoundResponse();
};

export const config: Config = {
  path: ["/api/artists", "/api/artists/:slug"],
};
