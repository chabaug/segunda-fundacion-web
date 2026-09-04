import type { Context, Config } from "@netlify/functions";
import { getCoversStore } from "../lib/releases-store.mts";

// GET /api/covers/:key — public, serves cover images uploaded through
// releases-cover.mts for scheduled/published releases. Distinct from the
// existing static assets/covers/{slug}.webp files (pre-migration releases) —
// this path only exists for releases created through the new API.
export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const key = url.pathname.split("/").pop() || "";
  const result = await getCoversStore().getWithMetadata(key, { type: "arrayBuffer" });
  if (!result) return new Response("Not found", { status: 404 });
  const contentType = (result.metadata && (result.metadata as any).contentType) || "image/jpeg";
  return new Response(result.data as ArrayBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};

export const config: Config = {
  path: "/api/covers/:key",
};
