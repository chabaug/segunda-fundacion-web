import type { Config } from "@netlify/functions";
import {
  loadHomepageVideo,
  saveHomepageVideo,
  nowISO,
  parseIsoDurationSeconds,
  pickHomepageVideo,
} from "../lib/youtube-store.mts";

const CHANNEL_HANDLE = "segundafundacion"; // youtube.com/@segundafundacion
const RECENT_UPLOADS_TO_SCAN = 15; // enough to skip past a run of Shorts

// Runs every 6 hours: finds the channel's most recent upload that ISN'T a
// Short (duration > 60s) and, if it's newer than what's currently on the
// homepage, swaps it in. Uses the playlistItems.list route (1 quota unit)
// instead of search.list (100 units) to find candidates, then videos.list
// (1 unit) to read real durations — search.list doesn't return duration at
// all, so there's no cheaper way to filter out Shorts.
export default async () => {
  const apiKey = Netlify.env.get("YOUTUBE_API_KEY");
  if (!apiKey) {
    console.log("youtube-sweep: YOUTUBE_API_KEY not set, skipping");
    return;
  }

  try {
    const uploadsPlaylistId = await getUploadsPlaylistId(apiKey);
    if (!uploadsPlaylistId) {
      console.log("youtube-sweep: could not resolve uploads playlist for @" + CHANNEL_HANDLE);
      return;
    }

    const candidates = await getRecentUploads(apiKey, uploadsPlaylistId);
    const withDurations = await attachDurations(apiKey, candidates);
    const current = await loadHomepageVideo();
    const pick = pickHomepageVideo(withDurations, current);
    if (!pick) {
      console.log(
        "youtube-sweep: no non-Short upload found in the last",
        RECENT_UPLOADS_TO_SCAN,
        "(or already up to date)"
      );
      return;
    }

    await saveHomepageVideo({ ...pick, updatedAt: nowISO() });
    console.log("youtube-sweep: swapped homepage video to", pick.videoId, "-", pick.title);
  } catch (err) {
    console.log("youtube-sweep: failed:", err instanceof Error ? err.message : err);
  }
};

async function getUploadsPlaylistId(apiKey: string): Promise<string | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("forHandle", CHANNEL_HANDLE);
  url.searchParams.set("key", apiKey);
  const data = await getJson(url);
  return data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

type Candidate = { videoId: string; title: string; publishedAt: string };

async function getRecentUploads(apiKey: string, playlistId: string): Promise<Candidate[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", String(RECENT_UPLOADS_TO_SCAN));
  url.searchParams.set("key", apiKey);
  const data = await getJson(url);
  return (data?.items ?? []).map((item: any) => ({
    videoId: item.snippet?.resourceId?.videoId,
    title: item.snippet?.title,
    publishedAt: item.snippet?.publishedAt,
  })).filter((v: Candidate) => v.videoId);
}

async function attachDurations(
  apiKey: string,
  candidates: Candidate[]
): Promise<(Candidate & { durationSeconds: number })[]> {
  if (candidates.length === 0) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", candidates.map((c) => c.videoId).join(","));
  url.searchParams.set("key", apiKey);
  const data = await getJson(url);
  const durations = new Map<string, number>(
    (data?.items ?? []).map((item: any) => [item.id, parseIsoDurationSeconds(item.contentDetails?.duration ?? "")])
  );
  return candidates.map((c) => ({ ...c, durationSeconds: durations.get(c.videoId) ?? 0 }));
}

async function getJson(url: URL): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.pathname} responded ${res.status}: ${await res.text()}`);
  return res.json();
}

export const config: Config = {
  schedule: "0 */6 * * *",
};
