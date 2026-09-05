// Turns a Playwright JSON reporter file into the compact summary consumed by
// the sf-status dashboard (github.com/chabaug/sf-status) and by the admin
// portal's Tests section.
// Usage: node scripts/build-status-summary.js <playwright-json-report> <suite-name> <out-file>
const fs = require('fs');

const [, , reportPath, suiteName, outPath] = process.argv;
const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

let passed = 0, failed = 0, skipped = 0, flaky = 0;
const failures = [];
const skips = [];

const ESC = String.fromCharCode(27);
const NEWLINE = String.fromCharCode(10);
// Character class written as [[] rather than an escaped bracket so the
// pattern survives being edited through shells and heredocs.
const ANSI_RE = new RegExp(ESC + '[[]' + '[0-9;]*m', 'g');

// Playwright records the string passed to test.skip(cond, 'reason') as an
// annotation, which is the closest thing to a self-maintaining explanation of
// why a test is skipped -- it lives next to the skip itself instead of in a
// hand-kept list that drifts out of date.
function skipReason(test) {
  const ann = (test.annotations || []).find(
    (a) => (a.type === 'skip' || a.type === 'fixme') && a.description
  );
  return ann ? ann.description : null;
}

// The head of the assertion error, ANSI stripped. The full stack stays in the
// linked run; what a dashboard needs is enough to tell "the flyer is 2px off
// in firefox" from "the page never loaded".
function failureError(test) {
  for (const result of test.results || []) {
    const fromErrors = (result.errors || [])[0];
    const message = (result.error && result.error.message) || (fromErrors && fromErrors.message);
    if (message) {
      return String(message)
        .replace(ANSI_RE, '')
        .split(NEWLINE)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 4)
        .join(' · ')
        .slice(0, 400);
    }
  }
  return null;
}

function walk(suite) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests) {
      const entry = { file: suite.title, title: spec.title, project: test.projectName };
      if (spec.file) entry.location = spec.line ? `${spec.file}:${spec.line}` : spec.file;
      if (test.status === 'skipped') {
        skipped++;
        skips.push({ ...entry, reason: skipReason(test) });
      } else if (test.status === 'expected') passed++;
      else if (test.status === 'unexpected') {
        failed++;
        failures.push({ ...entry, error: failureError(test) });
      } else if (test.status === 'flaky') { flaky++; passed++; }
    }
  }
  for (const sub of suite.suites || []) walk(sub);
}
for (const suite of report.suites) walk(suite);

const summary = {
  suite: suiteName,
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : null,
  runUrl: process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  durationMs: Math.round(report.stats.duration),
  counts: { passed, failed, skipped, flaky, total: passed + failed + skipped },
  failures,
  skips,
};

fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`Wrote ${outPath}:`, summary.counts);
