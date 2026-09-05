import type { Config } from "@netlify/functions";
import { loadHomepageVideo, jsonResponse } from "../lib/youtube-store.mts";

// GET /api/youtube-video -> { videoId, title, publishedAt }, read by
// index.html to fill in the "Último video" embed. Public, no auth — same
// data anyone can already see on the embedded player itself.
export default async () => {
  const { videoId, title, publishedAt } = await loadHomepageVideo();
  return jsonResponse({ videoId, title, publishedAt });
};

export const config: Config = {
  path: "/api/youtube-video",
};
