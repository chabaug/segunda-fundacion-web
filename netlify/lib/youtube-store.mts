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

export const SHORTS_MAX_SECONDS = 60; // YouTube's own Shorts cutoff

export type VideoCandidate = { videoId: string; title: string; publishedAt: string; durationSeconds: number };

// Pure decision logic for youtube-sweep.mts, pulled out so it's testable
// without hitting the real YouTube API: filters out Shorts, picks the
// newest remaining upload, and returns null if there's nothing eligible or
// the eligible pick is already what's saved. Excludes updatedAt (a
// wall-clock timestamp) so this stays a pure function of its inputs — the
// caller stamps that on separately.
export function pickHomepageVideo(
  candidates: VideoCandidate[],
  current: Pick<HomepageVideo, "videoId">
): Omit<HomepageVideo, "updatedAt"> | null {
  const longForm = candidates
    .filter((v) => v.durationSeconds > SHORTS_MAX_SECONDS)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const newest = longForm[0];
  if (!newest || newest.videoId === current.videoId) return null;
  return { videoId: newest.videoId, title: newest.title, publishedAt: newest.publishedAt.slice(0, 10) };
}
