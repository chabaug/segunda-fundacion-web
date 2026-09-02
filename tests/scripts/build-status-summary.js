// Turns a Playwright JSON reporter file into the compact summary consumed by
// the sf-status dashboard (github.com/chabaug/sf-status).
// Usage: node scripts/build-status-summary.js <playwright-json-report> <suite-name> <out-file>
const fs = require('fs');

const [, , reportPath, suiteName, outPath] = process.argv;
const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

let passed = 0, failed = 0, skipped = 0, flaky = 0;
const failures = [];
const skips = [];

function walk(suite) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests) {
      const entry = { file: suite.title, title: spec.title, project: test.projectName };
      if (test.status === 'skipped') { skipped++; skips.push(entry); }
      else if (test.status === 'expected') passed++;
      else if (test.status === 'unexpected') { failed++; failures.push(entry); }
      else if (test.status === 'flaky') { flaky++; passed++; }
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
