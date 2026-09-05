// Appends one run's summary to the rolling history file the admin portal's
// Tests section charts ("últimas 10 corridas"). Reads the current history
// straight from the GitHub Contents API rather than the Pages URL, so it sees
// the previous run's commit immediately instead of waiting for a Pages build.
//
// Usage: node scripts/append-status-history.js <summary-file> <path-in-sf-status> <out-file>
// Requires STATUS_REPO_TOKEN, same token push-status.sh uses.
//
// Two runs of the *same* suite finishing at once can race (both read the same
// history, second push fails on a stale sha). The publish step is
// continue-on-error and the next run re-reads, so the worst case is one
// missing point — not worth locking for a single-admin project.
const fs = require('fs');

const REPO = 'chabaug/sf-status';
const KEEP = 30; // portal shows the last 10; keep some slack for context

const [, , summaryPath, remotePath, outPath] = process.argv;
if (!summaryPath || !remotePath || !outPath) {
  console.error('usage: append-status-history.js <summary-file> <path-in-sf-status> <out-file>');
  process.exit(1);
}

async function readRemoteHistory() {
  const token = process.env.STATUS_REPO_TOKEN;
  if (!token) {
    console.warn('STATUS_REPO_TOKEN not set — starting history from scratch');
    return [];
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${remotePath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw' },
  });
  if (res.status === 404) return []; // first ever run for this suite
  if (!res.ok) {
    console.warn(`Could not read ${remotePath} (HTTP ${res.status}) — starting history from scratch`);
    return [];
  }
  const parsed = await res.json().catch(() => null);
  return Array.isArray(parsed) ? parsed : [];
}

(async () => {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  const entry = {
    suite: summary.suite,
    generatedAt: summary.generatedAt,
    commit: summary.commit,
    runUrl: summary.runUrl,
    durationMs: summary.durationMs,
    counts: summary.counts,
  };

  const history = await readRemoteHistory();
  // A re-run of the same workflow run would otherwise double-count.
  const deduped = history.filter((h) => !entry.runUrl || h.runUrl !== entry.runUrl);
  deduped.push(entry);
  deduped.sort((a, b) => String(a.generatedAt).localeCompare(String(b.generatedAt)));

  const trimmed = deduped.slice(-KEEP);
  fs.writeFileSync(outPath, JSON.stringify(trimmed, null, 2));
  console.log(`Wrote ${outPath}: ${trimmed.length} runs (latest ${entry.commit || '?'})`);
})();
