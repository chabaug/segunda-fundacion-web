// One fetch of /api/status shared by the Tests and Estado sections — it
// brings back the BAT/RTS latest runs, their history, the curated test
// pendientes and the per-page test coverage in a single round trip, so
// switching between the two sections doesn't re-hit the proxy.
import { apiJSON } from "./core.js";

let cached = null;

export function loadStatus(force) {
  if (!cached || force) {
    cached = apiJSON("/api/status").catch(function (err) {
      cached = null; // let the next caller retry instead of caching a failure
      throw err;
    });
  }
  return cached;
}
