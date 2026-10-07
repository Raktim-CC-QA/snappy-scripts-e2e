// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
    // Desktop viewports
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Desktop Firefox', use: { ...devices['Desktop Firefox'] } },
    
    // 2K/4K larger screens
    { 
      name: '2K (2560x1440)', 
      use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1440 } } 
    },
    { 
      name: '4K (3840x2160)', 
      use: { ...devices['Desktop Chrome'], viewport: { width: 3840, height: 2160 } } 
    },
    
    // iPads
    { name: 'iPad Pro 11', use: { ...devices['iPad Pro 11'] } },
    { name: 'iPad Pro 12.9', use: { ...devices['iPad Pro 12.9'] } },
    { name: 'iPad Mini', use: { ...devices['iPad Mini'] } },
    
    // iPhones
    { name: 'iPhone 14 Pro', use: { ...devices['iPhone 14 Pro'] } },
    { name: 'iPhone 14', use: { ...devices['iPhone 14'] } },
    { name: 'iPhone SE', use: { ...devices['iPhone SE'] } },
  ],
});