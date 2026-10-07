// tests/helpers/seoValidator.js
/**
 * SEO / GEO / AEO extraction & validation utilities.
 * All functions take a Playwright `page` and return plain objects.
 */

// ---------- EXTRACTORS ----------

async function extractMetaTags(page) {
  return page.evaluate(() => {
    const getMeta = (selector, attr = 'content') =>
      document.querySelector(selector)?.getAttribute(attr) || null;

    return {
      title: document.title || null,
      description: getMeta('meta[name="description"]'),
      robots: getMeta('meta[name="robots"]'),
      viewport: getMeta('meta[name="viewport"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      lang: document.documentElement.lang || null,
      ogTitle: getMeta('meta[property="og:title"]'),
      ogDescription: getMeta('meta[property="og:description"]'),
      ogImage: getMeta('meta[property="og:image"]'),
      ogType: getMeta('meta[property="og:type"]'),
      twitterCard: getMeta('meta[name="twitter:card"]'),
      twitterTitle: getMeta('meta[name="twitter:title"]'),
    };
  });
}

async function extractHeadings(page) {
  return page.evaluate(() => {
    const collect = (tag) =>
      Array.from(document.querySelectorAll(tag)).map(el => ({
        text: (el.textContent || '').trim().substring(0, 120),
        level: Number(tag.replace('h', '')),
      }));
    return {
      h1: collect('h1'),
      h2: collect('h2'),
      h3: collect('h3'),
    };
  });
}

async function extractJsonLd(page) {
  return page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    return Array.from(scripts).map((s, idx) => {
      try {
        return { index: idx, valid: true, data: JSON.parse(s.textContent) };
      } catch (err) {
        return {
          index: idx,
          valid: false,
          error: err.message,
          raw: (s.textContent || '').substring(0, 200),
        };
      }
    });
  });
}

async function extractImagesWithoutAlt(page) {
  return page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .filter(img => !img.hasAttribute('alt') || img.getAttribute('alt').trim() === '')
      .map(img => ({
        src: img.src,
        classes: img.className,
        parentText: (img.parentElement?.textContent || '').trim().substring(0, 60),
      }));
  });
}

// ---------- VALIDATORS ----------

function validateTitle(title) {
  const issues = [];
  if (!title) issues.push('Title is missing');
  else {
    if (title.length < 20) issues.push(`Title too short (${title.length} chars, min 20)`);
    if (title.length > 70) issues.push(`Title too long (${title.length} chars, rec. max 60)`);
  }
  return { ok: issues.length === 0, issues };
}

function validateMetaDescription(desc) {
  const issues = [];
  if (!desc) issues.push('Meta description missing');
  else {
    if (desc.length < 50) issues.push(`Meta description too short (${desc.length} chars, min 50)`);
    if (desc.length > 170) issues.push(`Meta description too long (${desc.length} chars, rec. max 160)`);
  }
  return { ok: issues.length === 0, issues };
}

function validateH1(h1Array) {
  const issues = [];
  if (h1Array.length === 0) issues.push('No <h1> found');
  if (h1Array.length > 1) issues.push(`Multiple <h1> tags found (${h1Array.length}); expected exactly 1`);
  return { ok: issues.length === 0, issues };
}

function validateHeadingHierarchy({ h1, h2, h3 }) {
  const issues = [];
  if (h3.length > 0 && h2.length === 0) {
    issues.push('H3 headings present without any H2 — hierarchy gap');
  }
  return { ok: issues.length === 0, issues };
}

function validateJsonLd(blocks) {
  const issues = [];
  const warnings = [];

  if (blocks.length === 0) {
    warnings.push('No JSON-LD structured data found — affects AEO');
  }

  const invalid = blocks.filter(b => !b.valid);
  if (invalid.length > 0) {
    issues.push(`${invalid.length} invalid JSON-LD block(s) failed parsing`);
  }

  const validBlocks = blocks.filter(b => b.valid).map(b => b.data);
  const types = validBlocks.flatMap(b => {
    if (Array.isArray(b)) return b.map(x => x['@type']);
    return [b['@type']];
  }).filter(Boolean);

  const recommended = ['Organization', 'FAQPage', 'Product', 'WebSite'];
  const missing = recommended.filter(t => !types.includes(t));
  if (missing.length > 0) {
    warnings.push(`Recommended JSON-LD types not found: ${missing.join(', ')}`);
  }

  // Validate @context
  validBlocks.forEach((b, i) => {
    const ctx = Array.isArray(b) ? b[0]?.['@context'] : b['@context'];
    if (ctx && !String(ctx).includes('schema.org')) {
      issues.push(`JSON-LD block ${i} has invalid @context: ${ctx}`);
    }
  });

  return { ok: issues.length === 0, issues, warnings, types };
}

// ---------- ANALYTICS ----------

function attachAnalyticsInterceptor(page) {
  const detected = [];
  page.on('request', req => {
    const url = req.url();
    if (
      url.includes('google-analytics.com') ||
      url.includes('googletagmanager.com') ||
      url.includes('analytics.google.com')
    ) {
      detected.push(url);
    }
  });
  return detected;
}

async function extractAnalyticsConfig(page) {
  return page.evaluate(() => {
    const gtmIds = new Set();
    const gaIds = new Set();

    document.querySelectorAll('script').forEach(s => {
      const src = s.src || s.textContent || '';
      (src.match(/GTM-[A-Z0-9]+/g) || []).forEach(id => gtmIds.add(id));
      (src.match(/G-[A-Z0-9]{6,}/g) || []).forEach(id => gaIds.add(id));
      (src.match(/UA-\d+-\d+/g) || []).forEach(id => gaIds.add(id));
    });

    return {
      gtmIds: [...gtmIds],
      gaIds: [...gaIds],
      hasDataLayer: typeof window.dataLayer !== 'undefined',
      dataLayerLength: window.dataLayer?.length || 0,
      hasGtagFn: typeof window.gtag === 'function',
    };
  });
}

// ---------- GEO ----------

function validateGeographicSignals(bodyText) {
  const signals = {
    usBased: /US[- ]based|United States|USA|U\.S\./i.test(bodyText),
    boardCertified: /Board[- ]Certified/i.test(bodyText),
    licensedProvider: /licensed\s+provider/i.test(bodyText),
    allStates: /across\s+(several|all)\s+states/i.test(bodyText),
  };
  const present = Object.entries(signals).filter(([, v]) => v).map(([k]) => k);
  const missing = Object.entries(signals).filter(([, v]) => !v).map(([k]) => k);
  return { signals, present, missing };
}

// ---------- AEO (FAQ) ----------

async function extractFaqQuestions(page) {
  return page.evaluate(() => {
    const faqRoot = document.querySelector(
      'section:has(h2), [id*="faq" i], [class*="faq" i]'
    );
    const scope = faqRoot || document;
    const candidates = scope.querySelectorAll(
      'h2, h3, h4, summary, [class*="question"], dt'
    );
    return Array.from(candidates)
      .map(el => (el.textContent || '').trim())
      .filter(t => t.endsWith('?') || /^What|^How|^Do I|^Can I|^Is /i.test(t))
      .slice(0, 50);
  });
}

module.exports = {
  extractMetaTags,
  extractHeadings,
  extractJsonLd,
  extractImagesWithoutAlt,
  validateTitle,
  validateMetaDescription,
  validateH1,
  validateHeadingHierarchy,
  validateJsonLd,
  attachAnalyticsInterceptor,
  extractAnalyticsConfig,
  validateGeographicSignals,
  extractFaqQuestions,
};