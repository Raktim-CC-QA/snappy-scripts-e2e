// tests/07-user-flows.spec.js
const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://staging.snappyscripts.com';

test.describe('Critical User Flows', () => {

  test('TC-FLOW-001: Navigate from Homepage to Product Detail Page', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Find a VISIBLE product link (filters out hidden mobile-menu duplicates)
    const productLink = page
      .locator('a:has-text("NAD"), a:has-text("Glutathione"), a:has-text("Sermorelin")')
      .filter({ visible: true })
      .first();

    await expect(productLink, 'No visible product link found on homepage').toBeVisible();

    const productHref = await productLink.getAttribute('href');
    console.log(`Clicking product link: ${productHref}`);
    expect(productHref, 'Product link has no href').toBeTruthy();

    await productLink.click();
    await page.waitForLoadState('networkidle');

    // Verify we actually navigated away from the homepage
    const currentUrl = page.url();
    console.log(`Landed on: ${currentUrl}`);
    expect(currentUrl, 'Did not navigate away from homepage').not.toBe(BASE_URL);
    expect(currentUrl, 'Navigation did not match link href').toContain(productHref);

    // PDP should have a heading
    const heading = await page.locator('h1, h2').first().innerText();
    console.log(`PDP heading: ${heading}`);
    expect(heading.trim().length).toBeGreaterThan(0);

    // Should have a CTA — assert it exists (warn only if not, depending on strictness)
    const pdpCta = page
      .locator('button:has-text("Add"), button:has-text("Get"), a:has-text("Questionnaire"), a:has-text("Start")')
      .filter({ visible: true })
      .first();

    const ctaVisible = await pdpCta.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`PDP CTA visible: ${ctaVisible}`);
    expect(ctaVisible, 'No CTA visible on PDP').toBe(true);
  });

  test('TC-FLOW-002: Questionnaire entry point accessibility', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const questionnaireCta = page
      .locator('a:has-text("Questionnaire"), button:has-text("Questionnaire"), a:has-text("Get Started"), a:has-text("Start")')
      .filter({ visible: true })
      .first();

    await expect(questionnaireCta, 'No visible questionnaire entry point on homepage').toBeVisible();
    console.log('✅ Questionnaire entry point found');

    await questionnaireCta.click();
    await page.waitForLoadState('networkidle');

    const questionUrl = page.url();
    console.log(`Questionnaire URL: ${questionUrl}`);

    // Assert navigation actually happened OR a modal/overlay opened
    const navigated = questionUrl !== BASE_URL && questionUrl !== `${BASE_URL}/`;
    const modalOpen = await page
      .locator('[role="dialog"], .modal, [class*="modal"], [class*="questionnaire"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    expect(
      navigated || modalOpen,
      `Clicking Questionnaire did nothing — URL stayed at ${questionUrl} and no modal appeared`
    ).toBe(true);

    // Should not be a 404
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Page Not Found');
  });

  test('TC-FLOW-003: Trust & FAQ content verification', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const requiredContent = [
      'NAD+',
      'Glutathione',
      'Sermorelin',
      'Board Certified',
      'Questionnaire',
      'Free Shipping',
      'Trustpilot',
    ];

    // body.innerText only returns VISIBLE text — good for this check
    const bodyText = await page.locator('body').innerText();

    const missing = [];
    for (const content of requiredContent) {
      const found = bodyText.includes(content);
      console.log(`${found ? '✅' : '❌'} "${content}": ${found ? 'Present' : 'Not found'}`);
      if (!found) missing.push(content);
    }

    // FAQ section
    const faqPresent = /Frequently\s*Asked\s*Questions/i.test(bodyText);
    console.log(`${faqPresent ? '✅' : '❌'} FAQ section: ${faqPresent ? 'Present' : 'Not found'}`);

    // How It Works
    const howItWorks = /How\s*It\s*Works/i.test(bodyText);
    console.log(`${howItWorks ? '✅' : '❌'} "How It Works": ${howItWorks ? 'Present' : 'Not found'}`);

    // NOW actually assert
    expect(missing, `Missing required content: ${missing.join(', ')}`).toHaveLength(0);
    expect(faqPresent, 'FAQ section not found').toBe(true);
    expect(howItWorks, '"How It Works" section not found').toBe(true);
  });
});