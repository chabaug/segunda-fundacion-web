import type { Context, Config } from "@netlify/functions";
import {
  loadEvents,
  saveEvents,
  sweepExpired,
  isAuthorized,
  slugify,
  nowISO,
  toPublicShape,
  jsonResponse,
  unauthorizedResponse,
  notFoundResponse,
  type SfEvent,
} from "../lib/events-store.mts";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","events", id?]
  const id = parts[2];

  const loaded = await loadEvents();
  const { events: swept, changed } = sweepExpired(loaded);
  if (changed) await saveEvents(swept);
  let events = swept;

  // GET /api/events           -> public, only active
  // GET /api/events?admin=1   -> requires token, everything
  if (req.method === "GET" && !id) {
    const isAdmin = url.searchParams.get("admin") === "1";
    if (isAdmin) {
      if (!isAuthorized(req)) return unauthorizedResponse();
      return jsonResponse(events);
    }
    return jsonResponse(events.filter((e) => e.active).map(toPublicShape));
  }

  // POST /api/events -> create
  if (req.method === "POST" && !id) {
    if (!isAuthorized(req)) return unauthorizedResponse();
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const date = String(body.date || "").trim();
    if (!name || !date) {
      return jsonResponse({ error: "name and date are required" }, 400);
    }
    let id2 = slugify(name) + "-" + date;
    let suffix = 2;
    while (events.some((e) => e.id === id2)) {
      id2 = slugify(name) + "-" + date + "-" + suffix++;
    }
    const now = nowISO();
    const newEvent: SfEvent = {
      id: id2,
      name,
      date,
      time: body.time || undefined,
      venue: body.venue || {},
      ticketUrl: body.ticketUrl || undefined,
      description: body.description || "",
      artists: Array.isArray(body.artists) ? body.artists : [],
      otherLinks: Array.isArray(body.otherLinks) ? body.otherLinks : [],
      active: body.active !== false,
      createdAt: now,
      updatedAt: now,
    };
    events.push(newEvent);
    await saveEvents(events);
    return jsonResponse(newEvent, 201);
  }

  if (!id) return notFoundResponse();
  const ev = events.find((e) => e.id === id);

  // PATCH /api/events/:id -> edit fields, including the active toggle
  if (req.method === "PATCH") {
    if (!isAuthorized(req)) return unauthorizedResponse();
    if (!ev) return notFoundResponse();
    const body = await req.json().catch(() => ({}));
    const patchable: (keyof SfEvent)[] = [
      "name", "date", "time", "venue", "ticketUrl", "description",
      "artists", "otherLinks", "active",
    ];
    for (const key of patchable) {
      if (key in body) (ev as any)[key] = body[key];
    }
    ev.updatedAt = nowISO();
    await saveEvents(events);
    return jsonResponse(ev);
  }

  // DELETE /api/events/:id
  if (req.method === "DELETE") {
    if (!isAuthorized(req)) return unauthorizedResponse();
    if (!ev) return notFoundResponse();
    events = events.filter((e) => e.id !== id);
    await saveEvents(events);
    return new Response(null, { status: 204 });
  }

  return notFoundResponse();
};

// :id matches exactly one path segment (URLPattern semantics) so this never
// swallows /api/events/:id/flyer, which events-flyer.mts owns separately.
export const config: Config = {
  path: ["/api/events", "/api/events/:id"],
};
