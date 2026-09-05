import type { Context, Config } from "@netlify/functions";
import {
  loadArtists,
  saveArtists,
  isAuthorized,
  nowISO,
  jsonResponse,
  unauthorizedResponse,
  notFoundResponse,
  getArtistPhotosStore,
} from "../lib/releases-store.mts";

// POST /api/artists/:slug/photo — uploads an artist photo. Setting this
// (alongside a real bio) is what flips isArtistComplete() to true and lets
// any releases blocked on this artist actually publish on their next sweep.
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return notFoundResponse();
  if (!isAuthorized(req)) return unauthorizedResponse();

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","artists", slug, "photo"]
  const slug = parts[2];

  const artists = await loadArtists();
  const artist = artists.find((a) => a.slug === slug);
  if (!artist) return notFoundResponse();

  const contentType = req.headers.get("content-type") || "image/jpeg";
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return jsonResponse({ error: "empty file" }, 400);

  const photoKey = `${slug}-${Date.now()}`;
  await getArtistPhotosStore().set(photoKey, buf, { metadata: { contentType } });

  artist.photoKey = photoKey;
  artist.updatedAt = nowISO();
  await saveArtists(artists);

  return jsonResponse(artist);
};

export const config: Config = {
  path: "/api/artists/*/photo",
};
