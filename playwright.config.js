// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'reports/html-report' }],
    ['json', { outputFile: 'reports/test-results.json' }],
    ['list']
  ],
  use: {
    baseURL: 'https://staging.snappyscripts.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 150000,
    navigationTimeout: 300000,
  },
  projects: [
    // ═══════════════════════════════════════════════════════════════
    // FUNCTIONAL TESTS — run everything EXCEPT responsiveness (02)
    // and performance (04) on a few representative viewports.
    // ═══════════════════════════════════════════════════════════════
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/02-responsiveness/, /04-performance/],
    },
    {
      name: 'Desktop Firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: [/02-responsiveness/, /04-performance/],
    },
    {
      name: 'iPhone 14',
      use: { ...devices['iPhone 14'] },
      testIgnore: [/02-responsiveness/, /04-performance/],
    },
    {
      name: 'iPhone SE',
      use: { ...devices['iPhone SE'] },
      testIgnore: [/02-responsiveness/, /04-performance/],
    },

    // ═══════════════════════════════════════════════════════════════
    // LIGHTHOUSE PERFORMANCE — Chrome ONLY.
    // Running this on 10 viewports was the #1 cause of the timeout.
    // ═══════════════════════════════════════════════════════════════
    {
      name: 'Lighthouse',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /04-performance\.spec\.js/,
      retries: 0,
    },

    // ═══════════════════════════════════════════════════════════════
    // RESPONSIVENESS — this is the ONLY suite that needs all viewports.
    // ═══════════════════════════════════════════════════════════════
    {
      name: '2K (2560x1440)',
      use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1440 } },
      testMatch: /02-responsiveness\.spec\.js/,
    },
    {
      name: '4K (3840x2160)',
      use: { ...devices['Desktop Chrome'], viewport: { width: 3840, height: 2160 } },
      testMatch: /02-responsiveness\.spec\.js/,
    },
    {
      name: 'iPad Pro 11',
      use: { ...devices['iPad Pro 11'] },
      testMatch: /02-responsiveness\.spec\.js/,
    },
    {
      name: 'iPad Pro 12.9',
      use: { ...devices['iPad Pro 12.9'] },
      testMatch: /02-responsiveness\.spec\.js/,
    },
    {
      name: 'iPad Mini',
      use: { ...devices['iPad Mini'] },
      testMatch: /02-responsiveness\.spec\.js/,
    },
    {
      name: 'iPhone 14 Pro',
      use: { ...devices['iPhone 14 Pro'] },
      testMatch: /02-responsiveness\.spec\.js/,
    },
  ],
});