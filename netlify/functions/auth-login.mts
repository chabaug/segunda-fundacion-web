import type { Context, Config } from "@netlify/functions";
import { jsonResponse } from "../lib/events-store.mts";

// Single-admin login: trades a username+password (easy to remember) for the
// same bearer token the admin panel already stores in localStorage and sends
// on every /api/events request — isAuthorized() in events-store.mts is
// unchanged, this just gives Augusto a friendlier way to obtain that token
// instead of copy-pasting it.
export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const expectedUser = Netlify.env.get("EVENTS_ADMIN_USER");
  const expectedPassword = Netlify.env.get("EVENTS_ADMIN_PASSWORD");
  const token = Netlify.env.get("EVENTS_ADMIN_TOKEN");
  if (!expectedUser || !expectedPassword || !token) {
    return jsonResponse({ error: "not_configured" }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "");
  const password = String(body.password || "");

  if (username !== expectedUser || password !== expectedPassword) {
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }

  return jsonResponse({ token });
};

export const config: Config = {
  path: "/api/auth/login",
};
