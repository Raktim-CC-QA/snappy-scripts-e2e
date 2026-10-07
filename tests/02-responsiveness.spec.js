// tests/02-responsiveness.spec.js
const { test, expect } = require('@playwright/test');

const viewports = [
  { name: '2K', width: 2560, height: 1440, isMobile: false },
  { name: '4K', width: 3840, height: 2160, isMobile: false },
  { name: 'iPad Pro 12.9', width: 1024, height: 1366, isMobile: true },
  { name: 'iPad Mini', width: 768, height: 1024, isMobile: true },
  { name: 'iPhone 14 Pro', width: 393, height: 852, isMobile: true },
  { name: 'iPhone SE', width: 375, height: 667, isMobile: true },
];

test.describe('Responsiveness Validation', () => {
  
  for (const vp of viewports) {
    test(`TC-RESP-001: ${vp.name} (${vp.width}x${vp.height}) layout integrity`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        userAgent: vp.isMobile 
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' 
          : undefined
      });
      
      const page = await context.newPage();
      await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

      // --- Check 1: No horizontal scrollbar ---
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll, `Horizontal scroll detected on ${vp.name}`).toBe(false);

      // --- Check 2: Hero content is visible ---
      const heroVisible = await page.locator('h1, h2, [class*="hero"]').first().isVisible();
      expect(heroVisible, `Hero section not visible on ${vp.name}`).toBe(true);

      // --- Check 3: No overlapping elements (sample check on nav area) ---
      const overlapCheck = await page.evaluate(() => {
        const header = document.querySelector('header, nav');
        if (!header) return { hasOverlap: false };
        
        const children = Array.from(header.children);
        for (let i = 0; i < children.length; i++) {
          for (let j = i + 1; j < children.length; j++) {
            const r1 = children[i].getBoundingClientRect();
            const r2 = children[j].getBoundingClientRect();
            if (r1.right > r2.left && r1.left < r2.right && 
                r1.bottom > r2.top && r1.top < r2.bottom &&
                r1.width > 0 && r2.width > 0) {
              return { hasOverlap: true, elements: [children[i].tagName, children[j].tagName] };
            }
          }
        }
        return { hasOverlap: false };
      });
      expect(overlapCheck.hasOverlap, `Overlapping elements in header on ${vp.name}`).toBe(false);

      // --- Check 4: Mobile touch targets (min 44px) ---
      if (vp.isMobile) {
        const smallTargets = await page.evaluate(() => {
          const interactive = document.querySelectorAll('button, a, [role="button"]');
          const small = [];
          interactive.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
              small.push({ tag: el.tagName, text: el.textContent?.trim().substring(0, 30), w: rect.width, h: rect.height });
            }
          });
          return small;
        });
        
        if (smallTargets.length > 0) {
          console.warn(`⚠️ Small touch targets on ${vp.name}:`, smallTargets);
        }
        // Warning only — some inline links legitimately smaller
      }

      // --- Check 5: Main content is not clipped ---
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length, `Page content appears empty on ${vp.name}`).toBeGreaterThan(100);

      await context.close();
    });
  }
});

// tests/02-responsiveness.spec.js (continued)

test.describe('Ultra-Wide Screen Containment', () => {
  
  test('TC-RESP-002: Content container max-width is enforced on 4K', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    const maxAllowed = 2000;

    // Measure only *intentionally constrained* content containers.
    // Exclude full-bleed wrappers (like <main>) that legitimately span the viewport.
    const containerData = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll(
        '[class*="max-w-"], [class*="container"], [class*="content-wrapper"], [class*="inner"]'
      ));

      const measured = candidates
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            cls: (el.className?.toString() || '').slice(0, 100),
            width: rect.width,
            height: rect.height,
          };
        })
        .filter(m => m.width > 0 && m.height > 0);

      const viewportWidth = document.documentElement.clientWidth;

      // A "constrained" container is one narrower than the viewport.
      const constrained = measured.filter(m => m.width < viewportWidth - 1);

      const widestConstrained = constrained.reduce(
        (max, m) => (m.width > max.width ? m : max),
        { width: 0, cls: '', tag: '' }
      );

      return { measured, widestConstrained, viewportWidth };
    });

    console.log('Viewport width:', containerData.viewportWidth);
    console.log('All measured containers:', containerData.measured);
    console.log('Widest constrained container:', containerData.widestConstrained);

    // Assert: at least one constrained container exists on the page.
    expect(
      containerData.widestConstrained.width,
      'No constrained content container found — all containers are full-bleed on 4K'
    ).toBeGreaterThan(0);

    // Assert: the constrained container respects readability limits.
    expect(
      containerData.widestConstrained.width,
      `Widest constrained container stretches too wide on 4K: ` +
      `${containerData.widestConstrained.width}px ` +
      `(selector: ${containerData.widestConstrained.tag}.${containerData.widestConstrained.cls})`
    ).toBeLessThan(maxAllowed);
  });

});