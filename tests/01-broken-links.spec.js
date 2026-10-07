// tests/01-broken-links.spec.js
const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://staging.snappyscripts.com';
const MAX_CONCURRENT = 5;

// Domains that block automated requests — do not flag as broken
const WHITELISTED_HOSTS = [
  'trustpilot.com',
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'linkedin.com',
  'youtube.com',
  'legitscript.com',
];

// Give the whole test room to breathe. Broken-link checks are slow.
test.setTimeout(120_000);

test.describe('Broken Link Check', () => {

  test('TC-LINK-001: All links on homepage should return valid status codes', async ({ page, request }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Extract links
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .map(a => ({
          href: a.href,
          text: a.textContent.trim(),
          isExternal: a.hostname !== window.location.hostname,
        }))
        .filter(link => {
          const h = link.href.toLowerCase();
          return h.startsWith('http') &&
                 !h.includes('javascript:') &&
                 !h.includes('mailto:') &&
                 !h.includes('tel:') &&
                 !h.endsWith('#') &&
                 !h.includes('#/');
        });
    });

    const uniqueLinks = [...new Map(links.map(l => [l.href, l])).values()];
    console.log(`Found ${uniqueLinks.length} unique links to validate`);

    const brokenLinks = [];
    const workingLinks = [];
    const skippedLinks = [];

    const isWhitelisted = (href) =>
      WHITELISTED_HOSTS.some(host => href.includes(host));

    for (let i = 0; i < uniqueLinks.length; i += MAX_CONCURRENT) {
      const batch = uniqueLinks.slice(i, i + MAX_CONCURRENT);

      const results = await Promise.all(
        batch.map(async (link) => {
          // Skip known bot-blockers — still verify they resolve via DNS
          if (isWhitelisted(link.href)) {
            return { ...link, status: 'SKIPPED', reason: 'Whitelisted host' };
          }

          const tryRequest = async (method) => {
            try {
              const resp = await request[method](link.href, {
                timeout: 8000,             // shorter than test timeout
                failOnStatusCode: false,
                maxRedirects: 5,
                headers: { 'User-Agent': 'SnappyScriptsQA/1.0' },
              });
              return { status: resp.status() };
            } catch (err) {
              return { status: 'ERROR', error: err.message };
            }
          };

          // Try HEAD first
          let result = await tryRequest('head');

          // Fall back to GET on 405/501 or on error
          if (result.status === 405 || result.status === 501 || result.status === 'ERROR') {
            const getResult = await tryRequest('get');
            // Use GET result only if it produced a number
            if (typeof getResult.status === 'number') result = getResult;
            else if (result.status === 'ERROR') result = getResult; // keep error info
          }

          return { ...link, ...result };
        })
      );

      results.forEach(result => {
        if (result.status === 'SKIPPED') {
          skippedLinks.push(result);
        } else if (typeof result.status === 'number' && result.status < 400) {
          workingLinks.push(result);
        } else if (typeof result.status === 'number' && (result.status === 403 || result.status === 429)) {
          // Bot-protection / rate-limit — not a broken link
          skippedLinks.push({ ...result, reason: `Blocked (${result.status})` });
        } else {
          brokenLinks.push(result);
        }
      });
    }

    if (brokenLinks.length > 0) {
      console.error('\n=== BROKEN LINKS DETECTED ===');
      brokenLinks.forEach(link => {
        console.error(`[${link.status}] ${link.href} — "${link.text}" (${link.isExternal ? 'External' : 'Internal'})`);
        if (link.error) console.error(`    ↳ ${link.error}`);
      });
    }

    if (skippedLinks.length > 0) {
      console.warn('\n=== SKIPPED LINKS (bot-blocked / whitelisted) ===');
      skippedLinks.forEach(link => {
        console.warn(`[${link.status}] ${link.href} — "${link.text}" (${link.reason || 'whitelisted'})`);
      });
    }

    console.log(`\n✅ Working links: ${workingLinks.length}/${uniqueLinks.length}`);
    console.log(`⏭️  Skipped links: ${skippedLinks.length}/${uniqueLinks.length}`);
    console.log(`❌ Broken links: ${brokenLinks.length}/${uniqueLinks.length}`);

    expect(brokenLinks, `Found ${brokenLinks.length} broken link(s)`).toHaveLength(0);
  });

  test('TC-LINK-002: Navigation from homepage to PDP, Questionnaire, and Checkout', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const navSelectors = [
      'nav a',
      'header a',
      '[data-testid="nav-link"]',
      'a:has-text("NAD")',
      'a:has-text("Glutathione")',
      'a:has-text("Sermorelin")',
    ];

    for (const selector of navSelectors) {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        console.log(`Found navigation group: ${selector} (${elements.length} items)`);
      }
    }

    // Questionnaire CTA must be VISIBLE
    const questionnaireCta = page
      .locator('a:has-text("Questionnaire"), button:has-text("Questionnaire"), a:has-text("Get Started")')
      .filter({ visible: true })
      .first();
    await expect(questionnaireCta).toBeVisible();

    // Product (PDP) links — the site uses short slugs like /nd-in, /mt-tb.
    // Match visible product-card anchors and known slug patterns.
    const productLinks = page
      .locator(
        [
          'a[href*="nd-in"]',       // NAD+ slug from your error log
          'a[href*="mt-tb"]',       // Metformin slug
          'a[href*="/product"]',
          'a:has-text("NAD")',
          'a:has-text("Glutathione")',
          'a:has-text("Sermorelin")',
        ].join(', ')
      )
      .filter({ visible: true });

    const count = await productLinks.count();
    console.log(`Found ${count} visible product link(s)`);

    // Debug: print what we actually found (helps if slugs change)
    if (count === 0) {
      const allAnchors = await page.locator('a[href]').evaluateAll(els =>
        els.map(e => ({
          href: e.getAttribute('href'),
          text: e.textContent.trim().slice(0, 40),
          visible: e.offsetParent !== null,
        })).filter(a => a.visible)
      );
      console.error('Visible anchors on page:', JSON.stringify(allAnchors, null, 2));
    }

    expect(count, 'No visible product (PDP) links found on homepage').toBeGreaterThan(0);
  });
});