// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8000',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    // Cross-browser sanity check, not part of the default desktop/mobile run —
    // invoke explicitly with `npm run test:crossbrowser` (which also scopes
    // to @bat so it doesn't blow up the run's duration). webkit needs
    // `npx playwright install webkit` before it can launch.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // tests/ lives inside the site repo now, so the repo root is one level up.
    command: 'python -m http.server 8000 --directory ..',
    url: 'http://localhost:8000/index.html',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
