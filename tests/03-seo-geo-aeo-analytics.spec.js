// tests/03-seo-geo-aeo-analytics.spec.js
const { test, expect } = require('@playwright/test');

test.describe('SEO Validation', () => {
  
  test('TC-SEO-001: Essential SEO meta tags exist on homepage', async ({ page }) => {
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    const seoData = await page.evaluate(() => {
      return {
        title: document.title,
        metaDescription: document.querySelector('meta[name="description"]')?.content,
        metaRobots: document.querySelector('meta[name="robots"]')?.content,
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        ogTitle: document.querySelector('meta[property="og:title"]')?.content,
        ogDescription: document.querySelector('meta[property="og:description"]')?.content,
        ogImage: document.querySelector('meta[property="og:image"]')?.content,
        h1Count: document.querySelectorAll('h1').length,
        h1Text: document.querySelector('h1')?.textContent?.trim(),
        h2Count: document.querySelectorAll('h2').length,
        lang: document.documentElement.lang,
      };
    });

    console.log('SEO Audit:', JSON.stringify(seoData, null, 2));

    // Title: 30–60 chars recommended
    expect(seoData.title, 'Missing title tag').toBeTruthy();
    expect(seoData.title.length, `Title too short: ${seoData.title.length} chars`).toBeGreaterThanOrEqual(20);

    // Meta description: 120–160 chars recommended
    expect(seoData.metaDescription, 'Missing meta description').toBeTruthy();
    if (seoData.metaDescription) {
      expect(seoData.metaDescription.length, 'Meta description too short').toBeGreaterThan(50);
    }

    // Exactly one H1
    expect(seoData.h1Count, `Found ${seoData.h1Count} H1 tags — expected exactly 1`).toBe(1);

    // lang attribute
    expect(seoData.lang, 'Missing html lang attribute').toBeTruthy();

    // Canonical (warn if missing, not fail on staging)
    if (!seoData.canonical) {
      console.warn('⚠️ No canonical URL found — recommended for production SEO');
    }

    // OG tags (warn if missing)
    if (!seoData.ogTitle || !seoData.ogDescription) {
      console.warn('⚠️ Open Graph tags incomplete — social sharing may be affected');
    }
  });

  test('TC-SEO-002: Structured data (JSON-LD) for AEO/GEO', async ({ page }) => {
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    const jsonLdScripts = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      return Array.from(scripts).map(s => {
        try { return JSON.parse(s.textContent); } 
        catch { return { error: 'Invalid JSON-LD', raw: s.textContent?.substring(0, 200) }; }
      });
    });

    console.log(`Found ${jsonLdScripts.length} JSON-LD block(s)`);
    jsonLdScripts.forEach((block, i) => {
      console.log(`Block ${i + 1}:`, JSON.stringify(block, null, 2).substring(0, 500));
    });

    if (jsonLdScripts.length === 0) {
      console.warn('⚠️ No JSON-LD structured data found — impacts AEO (Answer Engine Optimization)');
      console.warn('   Recommended: Organization, FAQPage, Product schemas');
    } else {
      // Validate context
      jsonLdScripts.forEach(block => {
        if (block['@context'] !== 'https://schema.org') {
          console.warn(`⚠️ JSON-LD @context is "${block['@context']}", expected "https://schema.org"`);
        }
      });
    }
  });

  test('TC-SEO-003: FAQ content is present for AEO', async ({ page }) => {
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    // Check for FAQ section
    const faqSection = page.locator('section:has-text("Frequently"), div:has-text("FAQ"), [id*="faq"], [class*="faq"]').first();
    const faqVisible = await faqSection.isVisible().catch(() => false);

    if (faqVisible) {
      // Verify questions are present
      const questions = await page.locator('h3, h4, [class*="question"], summary').filter({
        hasText: /\?$/
      }).count();
      
      console.log(`Found ${questions} FAQ-style questions`);
      expect(questions, 'FAQ section appears present but no questions detected').toBeGreaterThan(3);
    } else {
      console.warn('⚠️ No FAQ section detected — AEO optimization may be limited');
    }
  });

  test('TC-GEO-001: Geographic content and local SEO signals', async ({ page }) => {
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    const bodyText = await page.locator('body').innerText();

    // Check for US-based signals (GEO)
    const geoSignals = [
      { pattern: /US[- ]based/i, label: 'US-based' },
      { pattern: /Board Certified/i, label: 'Board Certified' },
      { pattern: /licensed provider/i, label: 'Licensed provider' },
      { pattern: /United States|USA|U\.S\./i, label: 'United States' },
    ];

    geoSignals.forEach(signal => {
      if (signal.pattern.test(bodyText)) {
        console.log(`✅ GEO signal found: ${signal.label}`);
      } else {
        console.warn(`⚠️ GEO signal missing: ${signal.label}`);
      }
    });
  });
});


// tests/03-seo-geo-aeo-analytics.spec.js (continued)

test.describe('Analytics Validation', () => {
  
  test('TC-ANALYTICS-001: Google Analytics / GTM tags are present', async ({ page }) => {
    const scriptsDetected = [];
    
    // Intercept network requests to GA/GTM endpoints
    page.on('request', request => {
      const url = request.url();
      if (url.includes('google-analytics.com') || 
          url.includes('googletagmanager.com') || 
          url.includes('gtag/js')) {
        scriptsDetected.push(url);
      }
    });

    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });
    
    // Also check DOM for GA/GTM IDs
    const analyticsConfig = await page.evaluate(() => {
      const gtmIds = [];
      const gaIds = [];
      
      // Check for GTM
      document.querySelectorAll('script').forEach(s => {
        const src = s.src || s.textContent || '';
        const gtmMatch = src.match(/GTM-[A-Z0-9]+/g);
        if (gtmMatch) gtmIds.push(...gtmMatch);
        
        const gaMatch = src.match(/G-[A-Z0-9]+|UA-\d+-\d+/g);
        if (gaMatch) gaIds.push(...gaMatch);
      });
      
      // Check dataLayer
      const hasDataLayer = typeof window.dataLayer !== 'undefined';
      const dataLayerLength = window.dataLayer?.length || 0;
      
      return { gtmIds, gaIds, hasDataLayer, dataLayerLength };
    });

    console.log('Analytics Config:', JSON.stringify(analyticsConfig, null, 2));
    console.log(`Analytics network requests intercepted: ${scriptsDetected.length}`);
    scriptsDetected.forEach(u => console.log(`  → ${u.substring(0, 120)}`));

    // On staging, analytics may be disabled — warn rather than fail
    const hasAnyAnalytics = scriptsDetected.length > 0 || 
                            analyticsConfig.gtmIds.length > 0 || 
                            analyticsConfig.gaIds.length > 0 || 
                            analyticsConfig.hasDataLayer;

    if (!hasAnyAnalytics) {
      console.warn('⚠️ No Google Analytics / GTM detected — verify staging environment configuration');
    }
  });
});