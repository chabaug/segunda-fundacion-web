import type { Context, Config } from "@netlify/functions";
import {
  loadReleases,
  saveReleases,
  isAuthorized,
  nowISO,
  jsonResponse,
  unauthorizedResponse,
  notFoundResponse,
  getCoversStore,
} from "../lib/releases-store.mts";

// POST /api/releases/:slug/cover — uploads a cover image for a release
// that's been scheduled ahead of its release date. Same raw-body upload
// pattern as events-flyer.mts (fetch(url, {body: file, headers:{'Content-Type':
// file.type}})) — no multipart parsing needed for a single-admin tool.
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return notFoundResponse();
  if (!isAuthorized(req)) return unauthorizedResponse();

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","releases", slug, "cover"]
  const slug = parts[2];

  const releases = await loadReleases();
  const rel = releases.find((r) => r.slug === slug);
  if (!rel) return notFoundResponse();

  const contentType = req.headers.get("content-type") || "image/jpeg";
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return jsonResponse({ error: "empty file" }, 400);

  const coverKey = `${slug}-${Date.now()}`;
  await getCoversStore().set(coverKey, buf, { metadata: { contentType } });

  rel.coverKey = coverKey;
  rel.updatedAt = nowISO();
  await saveReleases(releases);

  return jsonResponse(rel);
};

export const config: Config = {
  path: "/api/releases/*/cover",
};
