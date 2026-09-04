import type { Context, Config } from "@netlify/functions";
import { getArtistPhotosStore } from "../lib/releases-store.mts";

// GET /api/artist-photos/:key — public, serves artist photos uploaded
// through artist-photo.mts. Consumed directly as an <img src>.
export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const key = url.pathname.split("/").pop() || "";
  const result = await getArtistPhotosStore().getWithMetadata(key, { type: "arrayBuffer" });
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
  path: "/api/artist-photos/:key",
};
