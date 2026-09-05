import { getStore } from "@netlify/blobs";

export type HomepageVideo = {
  videoId: string;
  title: string;
  publishedAt: string; // ISO date (yyyy-mm-dd), used by index.html to decide
                        // whether the video or the latest release goes on top
  updatedAt: string;
};

// What index.html had hardcoded before this automation existed — kept as
// the answer until the first sweep ever runs (or if the sweep can't find
// anything and the store is still empty).
export const FALLBACK_VIDEO: HomepageVideo = {
  videoId: "pRbvFopJc-s",
  title: "Radio Mercurio — Nave",
  publishedAt: "2026-04-30",
  updatedAt: "1970-01-01T00:00:00.000Z",
};

const KEY = "homepage-video";

// Strong consistency for the same reason as releases-store.mts and
// events-store.mts: a low-traffic read-modify-write where an eventually-
// consistent read could serve a stale video right after the sweep writes.
export function getVideoStore() {
  return getStore({ name: "site-config", consistency: "strong" });
}

export async function loadHomepageVideo(): Promise<HomepageVideo> {
  const data = await getVideoStore().get(KEY, { type: "json" });
  return data && typeof data === "object" ? (data as HomepageVideo) : FALLBACK_VIDEO;
}

export async function saveHomepageVideo(video: HomepageVideo): Promise<void> {
  await getVideoStore().setJSON(KEY, video);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Parses YouTube's ISO 8601 durations (e.g. "PT4M13S", "PT1H2M10S", "PT45S")
// into whole seconds — used to tell a real upload (>60s) from a Short.
export function parseIsoDurationSeconds(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}
