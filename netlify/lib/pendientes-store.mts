import { getStore } from "@netlify/blobs";

// Curated "pendientes" — the internal to-do list behind the admin portal
// (things waiting on third parties, decisions not taken, loose ends). This
// lives in Blobs rather than as a JSON file in the repo on purpose:
// segunda-fundacion-web is a PUBLIC repo, so a committed file would be
// readable by anyone even though the page rendering it sits behind the admin
// token.
export type PendienteCategory =
  | "esperando-terceros"
  | "decision-pendiente"
  | "implementacion"
  | "dato-menor"
  | "info";

export type PendienteStatus = "open" | "done";

export type Pendiente = {
  id: string;
  category: PendienteCategory;
  title: string;
  detail: string;
  status: PendienteStatus;
  createdAt: string;
  updatedAt: string;
};

export const PENDIENTE_CATEGORIES: PendienteCategory[] = [
  "esperando-terceros",
  "decision-pendiente",
  "implementacion",
  "dato-menor",
  "info",
];

const PENDIENTES_KEY = "all";

// Strong consistency, same reasoning as the events store: single-admin,
// read-modify-write over one document, so a delete followed straight by
// another write must never read a stale pre-delete snapshot.
export function getPendientesStore() {
  return getStore({ name: "pendientes", consistency: "strong" });
}

export async function loadPendientes(): Promise<Pendiente[]> {
  const data = await getPendientesStore().get(PENDIENTES_KEY, { type: "json" });
  return Array.isArray(data) ? (data as Pendiente[]) : [];
}

export async function savePendientes(items: Pendiente[]): Promise<void> {
  await getPendientesStore().setJSON(PENDIENTES_KEY, items);
}

export function normalizeCategory(value: unknown): PendienteCategory {
  const s = String(value || "");
  return (PENDIENTE_CATEGORIES as string[]).includes(s) ? (s as PendienteCategory) : "implementacion";
}

export function normalizeStatus(value: unknown): PendienteStatus {
  return String(value || "") === "done" ? "done" : "open";
}
