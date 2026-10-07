// tests/04-performance.spec.js
const { test, expect } = require('@playwright/test');
const { playAudit } = require('playwright-lighthouse');
const { chromium } = require('playwright');

const THRESHOLDS = {
  performance: 70,
  accessibility: 80,
  bestPractices: 80,
  seo: 80,
  lcp: 4000,
  cls: 0.25,
  tbt: 600,
};

const CDP_PORT = 9222;

test.describe('Page Performance Audit', () => {

  test('TC-PERF-001: Lighthouse performance audit on homepage', async () => {
    const browser = await chromium.launch({
      args: [`--remote-debugging-port=${CDP_PORT}`],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    try {
      const result = await playAudit({
        page,
        port: CDP_PORT,
        // Zero every threshold so playAudit's built-in check never fires.
        // Real enforcement happens below in our own expect() calls.
        thresholds: {
          performance: 0,
          accessibility: 0,
          'best-practices': 0,
          seo: 0,
          pwa: 0,
        },
        reports: {
          formats: { json: true, html: true },
          name: 'homepage-lighthouse',
          directory: 'reports/lighthouse',
        },
      });

      const categories = result.lhr.categories;
      const audits = result.lhr.audits;
      const score = (cat) => Math.round((categories[cat]?.score ?? 0) * 100);

      console.log('\n=== Lighthouse Scores ===');
      console.log(`Performance:    ${score('performance')}/100 (min ${THRESHOLDS.performance})`);
      console.log(`Accessibility:  ${score('accessibility')}/100 (min ${THRESHOLDS.accessibility})`);
      console.log(`Best Practices: ${score('best-practices')}/100 (min ${THRESHOLDS.bestPractices})`);
      console.log(`SEO:            ${score('seo')}/100 (min ${THRESHOLDS.seo})`);

      console.log('\n=== Core Web Vitals ===');
      console.log(`LCP: ${audits['largest-contentful-paint']?.numericValue}ms (threshold: ${THRESHOLDS.lcp}ms)`);
      console.log(`CLS: ${audits['cumulative-layout-shift']?.numericValue} (threshold: ${THRESHOLDS.cls})`);
      console.log(`TBT: ${audits['total-blocking-time']?.numericValue}ms (threshold: ${THRESHOLDS.tbt}ms)`);
      console.log(`FCP: ${audits['first-contentful-paint']?.numericValue}ms`);
      console.log(`Speed Index: ${audits['speed-index']?.numericValue}ms`);

      // Diagnostic: list failing audits per category
      console.log('\n=== Failing Audits ===');
      for (const catKey of ['performance', 'accessibility', 'best-practices', 'seo']) {
        const cat = categories[catKey];
        if (!cat) continue;
        const failing = cat.auditRefs
          .filter(ref => ref.weight > 0)
          .map(ref => ({ ref, audit: audits[ref.id] }))
          .filter(({ audit }) => audit && audit.score !== null && audit.score < 1);

        if (failing.length > 0) {
          console.log(`\n[${catKey}]`);
          failing.forEach(({ ref, audit }) => {
            console.log(
              `  - ${ref.id} (weight ${ref.weight}, score ${audit.score}): ` +
              `${audit.title}${audit.displayValue ? ` — ${audit.displayValue}` : ''}`
            );
          });
        }
      }

      // Real assertions
      expect(score('performance'), 'Performance below threshold').toBeGreaterThanOrEqual(THRESHOLDS.performance);
      expect(score('accessibility'), 'Accessibility below threshold').toBeGreaterThanOrEqual(THRESHOLDS.accessibility);
      expect(score('best-practices'), 'Best Practices below threshold').toBeGreaterThanOrEqual(THRESHOLDS.bestPractices);
      expect(score('seo'), 'SEO below threshold').toBeGreaterThanOrEqual(THRESHOLDS.seo);

      expect(audits['largest-contentful-paint']?.numericValue, 'LCP too high').toBeLessThan(THRESHOLDS.lcp);
      expect(audits['cumulative-layout-shift']?.numericValue, 'CLS too high').toBeLessThan(THRESHOLDS.cls);

    } finally {
      await browser.close();
    }
  });

  test('TC-PERF-002: Page load time metrics (custom)', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'load' });
    const loadTime = Date.now() - startTime;

    const performanceMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      return {
        domContentLoaded: nav?.domContentLoadedEventEnd,
        domInteractive: nav?.domInteractive,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
        lcp: lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : null,
        resourceCount: performance.getEntriesByType('resource').length,
      };
    });

    console.log('\n=== Custom Performance Metrics ===');
    console.log(`Full load time: ${loadTime}ms`);
    console.log(`DOM Content Loaded: ${performanceMetrics.domContentLoaded?.toFixed(0)}ms`);
    console.log(`First Contentful Paint: ${performanceMetrics.firstContentfulPaint?.toFixed(0)}ms`);
    console.log(`Resources loaded: ${performanceMetrics.resourceCount}`);

    expect(loadTime, `Page load exceeded 8s: ${loadTime}ms`).toBeLessThan(8000);
  });
});