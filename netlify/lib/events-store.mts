import { getStore } from "@netlify/blobs";

export type EventArtist = { name: string; link?: string };
export type EventOtherLink = { label: string; url: string };
export type EventVenue = { name?: string; address?: string; link?: string };

export type SfEvent = {
  id: string;
  name: string;
  date: string; // ISO yyyy-mm-dd
  time?: string; // HH:MM, optional
  venue: EventVenue;
  ticketUrl?: string;
  flyerKey?: string;
  description?: string;
  artists: EventArtist[];
  otherLinks: EventOtherLink[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const EVENTS_KEY = "all";

export function getEventsStore() {
  return getStore("events");
}

export function getFlyersStore() {
  return getStore("flyers");
}

export async function loadEvents(): Promise<SfEvent[]> {
  const data = await getEventsStore().get(EVENTS_KEY, { type: "json" });
  return Array.isArray(data) ? (data as SfEvent[]) : [];
}

export async function saveEvents(events: SfEvent[]): Promise<void> {
  await getEventsStore().setJSON(EVENTS_KEY, events);
}

export function nowISO(): string {
  return new Date().toISOString();
}

// An event auto-deactivates the day after it happens, unless Augusto has
// already turned it off himself — this mirrors the same computation used
// both on every API read (so it's correct even with zero traffic between
// visits) and in the daily scheduled sweep (so it still happens even if
// nobody hits the API that day).
export function sweepExpired(events: SfEvent[]): { events: SfEvent[]; changed: boolean } {
  const todayISO = new Date().toISOString().slice(0, 10);
  let changed = false;
  const swept = events.map((ev) => {
    if (!ev.active || !ev.date) return ev;
    const dayAfter = addDaysISO(ev.date, 1);
    if (todayISO > dayAfter) {
      changed = true;
      return { ...ev, active: false, updatedAt: nowISO() };
    }
    return ev;
  });
  return { events: swept, changed };
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DIACRITICS_RE = new RegExp("[̀-ͯ]", "g");

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[¡!¿?]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatDateLabelEs(dateISO: string, time?: string): string {
  if (!dateISO) return "";
  const d = new Date(dateISO + "T00:00:00Z");
  if (isNaN(d.getTime())) return dateISO;
  const weekday = WEEKDAYS_ES[d.getUTCDay()];
  const label = `${cap(weekday)} ${d.getUTCDate()} de ${MONTHS_ES[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
  return time ? `${label} · ${time}` : label;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isAuthorized(req: Request): boolean {
  const expected = Netlify.env.get("EVENTS_ADMIN_TOKEN");
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const fromQuery = new URL(req.url).searchParams.get("token") || "";
  return bearer === expected || fromQuery === expected;
}

export function toPublicShape(ev: SfEvent) {
  return {
    id: ev.id,
    name: ev.name,
    date: ev.date,
    dateLabel: formatDateLabelEs(ev.date, ev.time),
    venue: ev.venue || {},
    ticketUrl: ev.ticketUrl || null,
    flyer: ev.flyerKey ? `/api/flyers/${ev.flyerKey}` : null,
    description: ev.description || "",
    artists: ev.artists || [],
    otherLinks: ev.otherLinks || [],
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function unauthorizedResponse(): Response {
  return jsonResponse({ error: "unauthorized" }, 401);
}

export function notFoundResponse(): Response {
  return jsonResponse({ error: "not_found" }, 404);
}
