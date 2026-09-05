import type { Context, Config } from "@netlify/functions";
import {
  isAuthorized,
  slugify,
  nowISO,
  jsonResponse,
  unauthorizedResponse,
  notFoundResponse,
} from "../lib/events-store.mts";
import {
  loadPendientes,
  savePendientes,
  normalizeCategory,
  normalizeStatus,
  type Pendiente,
} from "../lib/pendientes-store.mts";

// Every route here is admin-only — there is no public shape for this data.
export default async (req: Request, _context: Context) => {
  if (!isAuthorized(req)) return unauthorizedResponse();

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","pendientes", id?]
  const id = parts[2];

  let items = await loadPendientes();

  // GET /api/pendientes
  if (req.method === "GET" && !id) {
    return jsonResponse(items);
  }

  // POST /api/pendientes -> create
  if (req.method === "POST" && !id) {
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    if (!title) return jsonResponse({ error: "title is required" }, 400);

    let newId = slugify(title).slice(0, 60) || "pendiente";
    let suffix = 2;
    while (items.some((p) => p.id === newId)) newId = `${slugify(title).slice(0, 60)}-${suffix++}`;

    const now = nowISO();
    const created: Pendiente = {
      id: newId,
      category: normalizeCategory(body.category),
      title,
      detail: String(body.detail || "").trim(),
      status: normalizeStatus(body.status),
      createdAt: now,
      updatedAt: now,
    };
    items = items.concat(created);
    await savePendientes(items);
    return jsonResponse(created, 201);
  }

  const existing = id ? items.find((p) => p.id === id) : undefined;

  // PATCH /api/pendientes/:id
  if (req.method === "PATCH" && id) {
    if (!existing) return notFoundResponse();
    const body = await req.json().catch(() => ({}));
    const updated: Pendiente = {
      ...existing,
      category: body.category === undefined ? existing.category : normalizeCategory(body.category),
      title: body.title === undefined ? existing.title : String(body.title).trim() || existing.title,
      detail: body.detail === undefined ? existing.detail : String(body.detail).trim(),
      status: body.status === undefined ? existing.status : normalizeStatus(body.status),
      updatedAt: nowISO(),
    };
    items = items.map((p) => (p.id === id ? updated : p));
    await savePendientes(items);
    return jsonResponse(updated);
  }

  // DELETE /api/pendientes/:id
  if (req.method === "DELETE" && id) {
    if (!existing) return notFoundResponse();
    items = items.filter((p) => p.id !== id);
    await savePendientes(items);
    return new Response(null, { status: 204 });
  }

  return notFoundResponse();
};

export const config: Config = {
  path: ["/api/pendientes", "/api/pendientes/:id"],
};
