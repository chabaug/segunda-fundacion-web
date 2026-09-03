import type { Config } from "@netlify/functions";
import { loadEvents, saveEvents, sweepExpired } from "../lib/events-store.mts";

// Runs once a day regardless of site traffic — belt-and-suspenders on top
// of the same sweep events.mts already runs on every GET, so an event that
// should auto-deactivate the day after it happens actually does, even if
// nobody opens the site or the admin panel that day.
export default async () => {
  const events = await loadEvents();
  const { events: swept, changed } = sweepExpired(events);
  if (changed) await saveEvents(swept);
};

export const config: Config = {
  schedule: "@daily",
};
