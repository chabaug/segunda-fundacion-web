import type { Config } from "@netlify/functions";
import { loadReleases, saveReleases, loadArtists, sweepScheduled } from "../lib/releases-store.mts";

// Runs once a day at 00:00 UTC regardless of site traffic — belt-and-
// suspenders on top of the same sweep releases.mts already runs on every
// GET, so a release whose releaseDate arrives actually goes live even if
// nobody hits the API or the admin panel right at midnight.
//
// Netlify's @daily schedule fires at 00:00 UTC, not 00:00 ART (UTC-3) — a
// release dated "today" in Argentina only becomes true in sweepScheduled()'s
// own todayISO check once UTC has also rolled over, so in practice this can
// fire up to 3 hours after real Argentina midnight. Every GET to
// /api/releases re-runs the same sweep in the meantime, so the gap is
// invisible to any visitor loading the site — it only affects the
// zero-traffic edge case this scheduled function exists to cover at all.
export default async () => {
  const [releases, artists] = await Promise.all([loadReleases(), loadArtists()]);
  const { releases: swept, changed, blocked } = sweepScheduled(releases, artists);
  if (changed) await saveReleases(swept);
  if (blocked.length) {
    // Netlify function logs are the only "notification" this has for now —
    // Augusto sees this via `netlify functions:log` or the Netlify
    // dashboard. Surfacing it more visibly (email, or a banner in the
    // future admin/catalogo.html panel) is a Fase 2 concern, not built yet.
    console.log(
      "releases-sweep: blocked (artist profile incomplete):",
      blocked.map((r) => `${r.slug} (artist: ${r.artistSlug})`).join(", ")
    );
  }
};

export const config: Config = {
  schedule: "@daily",
};
