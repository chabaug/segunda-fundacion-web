// Builds the "cobertura de tests por página" summary the admin portal shows:
// which pages of the site have Playwright specs pointed at them, how many
// tests each spec carries, and which pages nobody is testing.
//
// Usage: node scripts/build-coverage-summary.js <out-file>
//
// The mapping is static: it scans each spec for string literals ending in
// ".html". That deliberately looks at *all* literals, not just the argument
// of page.goto(), because several specs loop over a PAGES array instead of
// calling goto with an inline path. It's a heuristic, not a runtime trace —
// a page reached only through a computed URL would be missed.
const fs = require('fs');
const path = require('path');

const outPath = process.argv[2];
if (!outPath) {
  console.error('usage: build-coverage-summary.js <out-file>');
  process.exit(1);
}

const testsDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(testsDir, '..');
const specsDir = path.join(testsDir, 'specs');

function listPages() {
  const pages = fs.readdirSync(repoRoot)
    .filter((f) => f.endsWith('.html'))
    .map((f) => '/' + f);
  const adminDir = path.join(repoRoot, 'admin');
  if (fs.existsSync(adminDir)) {
    for (const f of fs.readdirSync(adminDir)) {
      if (f.endsWith('.html')) pages.push('/admin/' + f);
    }
  }
  return pages.sort();
}

const HTML_LITERAL_RE = /['"`]([^'"`\n]*\.html)['"`]/g;
const TEST_RE = /(^|[^.\w])test\s*\(\s*(['"`])((?:\.|(?!\2)[\s\S])*?)\2/g;

function scanSpec(file) {
  const src = fs.readFileSync(path.join(specsDir, file), 'utf-8');

  const pages = new Set();
  for (const m of src.matchAll(HTML_LITERAL_RE)) {
    let ref = m[1];
    if (!ref.startsWith('/')) ref = '/' + ref;
    pages.add(ref);
  }

  let tests = 0;
  let batTests = 0;
  for (const m of src.matchAll(TEST_RE)) {
    tests++;
    if (m[3].includes('@bat')) batTests++;
  }

  return { file, tests, batTests, pages: Array.from(pages).sort() };
}

const pages = listPages();
const specs = fs.readdirSync(specsDir).filter((f) => f.endsWith('.spec.js')).sort().map(scanSpec);

const pageRows = pages.map((page) => {
  const covering = specs.filter((s) => s.pages.includes(page));
  return {
    page,
    specs: covering.map((s) => s.file),
    tests: covering.reduce((n, s) => n + s.tests, 0),
    batTests: covering.reduce((n, s) => n + s.batTests, 0),
  };
});

// Specs with no page literal at all are unit/API suites (they import a
// netlify/lib module or hit the API directly) — real coverage, just not of a
// page, so they're reported separately instead of counted as a gap.
const unitSpecs = specs.filter((s) => s.pages.length === 0);

const summary = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : null,
  totals: {
    pages: pageRows.length,
    pagesCovered: pageRows.filter((p) => p.specs.length > 0).length,
    specs: specs.length,
    unitSpecs: unitSpecs.length,
    tests: specs.reduce((n, s) => n + s.tests, 0),
    batTests: specs.reduce((n, s) => n + s.batTests, 0),
  },
  pages: pageRows,
  specs,
};

fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`Wrote ${outPath}:`, summary.totals);
