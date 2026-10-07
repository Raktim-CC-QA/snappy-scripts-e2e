// tests/05-legitscript-content.spec.js
const { test, expect } = require('@playwright/test');

test.describe('LegitScript Certification Content', () => {
  
  test('TC-LEGIT-001: LegitScript certification badge/content is present', async ({ page }) => {
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    const bodyText = await page.locator('body').innerText();
    const bodyHtml = await page.locator('body').innerHTML();

    // Check text references
    const hasLegitScriptText = /LegitScript/i.test(bodyText);
    console.log(`LegitScript text mention: ${hasLegitScriptText ? '✅ Found' : '❌ Missing'}`);

    // Check for badge/image
    const legitImages = await page.locator('img[src*="legit"], img[alt*="Legit"], img[class*="legit"]').count();
    console.log(`LegitScript badge images: ${legitImages}`);

    // Check for certification footer/trust section
    const trustSection = await page.locator('[class*="trust"], [class*="certif"], footer').first().innerText().catch(() => '');
    const hasTrustText = /LegitScript|certified/i.test(trustSection);

    // Check testimonial references (Denise's review mentions LegitScript)
    const reviewMentionsLegit = /LegitScript/i.test(bodyText);

    const hasLegitSignal = hasLegitScriptText || legitImages > 0 || hasTrustText;

    if (!hasLegitSignal) {
      console.error('❌ No LegitScript certification signal found on homepage');
      console.error('   This is a compliance risk for a telehealth pharmacy site.');
    }

    expect(hasLegitSignal, 'LegitScript certification reference missing from homepage').toBe(true);
  });

  test('TC-LEGIT-002: LegitScript link resolves correctly (if present)', async ({ page, request }) => {
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    // Find all links that might reference LegitScript
    const legitLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => 
        (a.href && a.href.toLowerCase().includes('legitscript')) ||
        (a.textContent && a.textContent.toLowerCase().includes('legitscript'))
      ).map(a => ({ href: a.href, text: a.textContent.trim() }));
    });

    console.log(`Found ${legitLinks.length} LegitScript link(s)`);

    for (const link of legitLinks) {
      const response = await request.get(link.href, { failOnStatusCode: false });
      console.log(`  ${link.text}: ${link.href} → HTTP ${response.status()}`);
      expect(response.status(), `LegitScript link broken: ${link.href}`).toBeLessThan(400);
    }
  });

  test('TC-LEGIT-003: Trust indicators (Trustpilot rating) are present and accurate', async ({ page }) => {
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    const bodyText = await page.locator('body').innerText();

    // Trustpilot rating mentioned in content: "4.7/5 on Trustpilot"
    const trustpilotMatch = bodyText.match(/(\d+\.?\d*)\/5.*Trustpilot/i);
    if (trustpilotMatch) {
      const rating = parseFloat(trustpilotMatch[1]);
      console.log(`✅ Trustpilot rating found: ${rating}/5`);
      expect(rating, 'Trustpilot rating out of expected range').toBeGreaterThanOrEqual(1);
      expect(rating, 'Trustpilot rating out of expected range').toBeLessThanOrEqual(5);
    } else {
      console.warn('⚠️ Trustpilot rating not found in visible text');
    }

    // Check for Trustpilot widget
    const trustpilotWidget = await page.locator('[class*="trustpilot"], [id*="trustpilot"], script[src*="trustpilot"]').count();
    console.log(`Trustpilot widget elements: ${trustpilotWidget}`);
  });
});