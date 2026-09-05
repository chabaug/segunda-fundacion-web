import type { Context, Config } from "@netlify/functions";
import {
  loadReleases,
  saveReleases,
  loadArtists,
  sweepScheduled,
  isAuthorized,
  slugify,
  nowISO,
  toPublicRelease,
  jsonResponse,
  unauthorizedResponse,
  notFoundResponse,
  type SfRelease,
} from "../lib/releases-store.mts";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","releases", slug?]
  const slug = parts[2];

  const [loaded, artists] = await Promise.all([loadReleases(), loadArtists()]);
  const { releases: swept, changed } = sweepScheduled(loaded, artists);
  if (changed) await saveReleases(swept);
  let releases = swept;

  // GET /api/releases         -> public: published only, public shape
  // GET /api/releases?admin=1 -> requires token, everything (scheduled too)
  if (req.method === "GET" && !slug) {
    const isAdmin = url.searchParams.get("admin") === "1";
    if (isAdmin) {
      if (!isAuthorized(req)) return unauthorizedResponse();
      return jsonResponse(releases);
    }
    return jsonResponse(
      releases.filter((r) => r.status === "published").map(toPublicRelease)
    );
  }

  // POST /api/releases -> create (always starts "scheduled")
  if (req.method === "POST" && !slug) {
    if (!isAuthorized(req)) return unauthorizedResponse();
    const body = await req.json().catch(() => ({}));
    const artist = String(body.artist || "").trim();
    const title = String(body.title || "").trim();
    const releaseDate = String(body.releaseDate || "").trim();
    if (!artist || !title || !releaseDate) {
      return jsonResponse({ error: "artist, title and releaseDate are required" }, 400);
    }
    let newSlug = slugify(artist + "-" + title);
    let suffix = 2;
    while (releases.some((r) => r.slug === newSlug)) {
      newSlug = slugify(artist + "-" + title) + "-" + suffix++;
    }
    const now = nowISO();
    const release: SfRelease = {
      slug: newSlug,
      artist,
      artistSlug: body.artistSlug ? slugify(String(body.artistSlug)) : slugify(artist),
      title,
      suffix: body.suffix === "ep" || body.suffix === "album" ? body.suffix : "single",
      sfNumber: typeof body.sfNumber === "number" ? body.sfNumber : undefined,
      releaseDate,
      status: "scheduled",
      tracks: Array.isArray(body.tracks) ? body.tracks : [title],
      credits: body.credits || undefined,
      streaming: body.streaming || {},
      video: body.video || undefined,
      coverKey: undefined,
      createdAt: now,
      updatedAt: now,
    };
    releases.push(release);
    await saveReleases(releases);
    return jsonResponse(release, 201);
  }

  if (!slug) return notFoundResponse();
  const rel = releases.find((r) => r.slug === slug);

  // PATCH /api/releases/:slug -> edit fields, including releaseDate/status
  if (req.method === "PATCH") {
    if (!isAuthorized(req)) return unauthorizedResponse();
    if (!rel) return notFoundResponse();
    const body = await req.json().catch(() => ({}));
    const patchable: (keyof SfRelease)[] = [
      "artist", "artistSlug", "title", "suffix", "sfNumber", "releaseDate",
      "status", "tracks", "credits", "streaming", "video",
    ];
    for (const key of patchable) {
      if (key in body) (rel as any)[key] = body[key];
    }
    rel.updatedAt = nowISO();
    await saveReleases(releases);
    return jsonResponse(rel);
  }

  // DELETE /api/releases/:slug
  if (req.method === "DELETE") {
    if (!isAuthorized(req)) return unauthorizedResponse();
    if (!rel) return notFoundResponse();
    releases = releases.filter((r) => r.slug !== slug);
    await saveReleases(releases);
    return new Response(null, { status: 204 });
  }

  return notFoundResponse();
};

// :slug matches exactly one path segment so this never swallows
// /api/releases/:slug/cover, which releases-cover.mts owns separately.
export const config: Config = {
  path: ["/api/releases", "/api/releases/:slug"],
};
