import type { Context, Config } from "@netlify/functions";
import { getFlyersStore } from "../lib/events-store.mts";

// GET /api/flyers/:key — public, serves the flyer image bytes uploaded
// through events-flyer.mts. Consumed directly as an <img src>.
export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const key = url.pathname.split("/").pop() || "";
  const result = await getFlyersStore().getWithMetadata(key, { type: "arrayBuffer" });
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
  path: "/api/flyers/:key",
};
