import type { Context, Config } from "@netlify/functions";
import { isAuthorized, jsonResponse, unauthorizedResponse } from "../lib/events-store.mts";

// Server-side proxy for the JSON the CI workflows publish into the sf-status
// repo (github.com/chabaug/sf-status, served over GitHub Pages). Fetching it
// from here rather than straight from the browser keeps the admin portal on a
// single origin — no cross-origin dependency that can break silently — and
// lets one request bring back everything the Tests and Estado sections need.
const DEFAULT_BASE = "https://chabaug.github.io/sf-status/data";

const SOURCES: Record<string, string> = {
  bat: "bat-latest.json",
  rts: "rts-latest.json",
  batHistory: "bat-history.json",
  rtsHistory: "rts-history.json",
  testPendientes: "pendientes.json",
  coverage: "coverage-latest.json",
};

async function fetchJson(base: string, file: string): Promise<unknown | null> {
  try {
    // Cache-buster: GitHub Pages caches aggressively, and a dashboard that
    // shows last night's run as "the latest" is worse than one that shows
    // nothing.
    const res = await fetch(`${base}/${file}?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async (req: Request, _context: Context) => {
  if (!isAuthorized(req)) return unauthorizedResponse();

  const base = Netlify.env.get("STATUS_DATA_BASE") || DEFAULT_BASE;
  const entries = await Promise.all(
    Object.entries(SOURCES).map(async ([key, file]) => [key, await fetchJson(base, file)] as const)
  );

  const payload: Record<string, unknown> = { fetchedAt: new Date().toISOString(), source: base };
  for (const [key, value] of entries) payload[key] = value;

  return jsonResponse(payload);
};

export const config: Config = {
  path: "/api/status",
};
