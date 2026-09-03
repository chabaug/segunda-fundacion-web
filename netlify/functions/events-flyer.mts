import type { Context, Config } from "@netlify/functions";
import {
  loadEvents,
  saveEvents,
  isAuthorized,
  nowISO,
  jsonResponse,
  unauthorizedResponse,
  notFoundResponse,
  getFlyersStore,
} from "../lib/events-store.mts";

// POST /api/events/:id/flyer — uploads a flyer image for an existing event.
// The admin page sends the raw file as the request body (fetch(url, {body:
// file, headers:{'Content-Type': file.type}})), not multipart — simplest
// possible upload path for a single-admin internal tool.
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return notFoundResponse();
  if (!isAuthorized(req)) return unauthorizedResponse();

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","events", id, "flyer"]
  const id = parts[2];

  const events = await loadEvents();
  const ev = events.find((e) => e.id === id);
  if (!ev) return notFoundResponse();

  const contentType = req.headers.get("content-type") || "image/jpeg";
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return jsonResponse({ error: "empty file" }, 400);

  const flyerKey = `${id}-${Date.now()}`;
  await getFlyersStore().set(flyerKey, buf, { metadata: { contentType } });

  ev.flyerKey = flyerKey;
  ev.updatedAt = nowISO();
  await saveEvents(events);

  return jsonResponse(ev);
};

export const config: Config = {
  path: "/api/events/*/flyer",
};
