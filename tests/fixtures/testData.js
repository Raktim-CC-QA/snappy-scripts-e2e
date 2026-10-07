// tests/fixtures/testData.js
/**
 * Centralized test data for Snappy Scripts E2E suite.
 * Update this file when the site content changes — specs should NOT hardcode strings.
 */

const BASE_URL = process.env.BASE_URL || 'https://staging.snappyscripts.com';

// ---------- URL ROUTES ----------
const ROUTES = {
  home: '/',
  // PDP slugs — update once confirmed from live nav
  pdpNad: '/nad',
  pdpGlutathione: '/glutathione',
  pdpSermorelin: '/sermorelin',
  questionnaire: '/questionnaire',
  checkout: '/checkout',
  faq: '/faq',
  contact: '/contact',
  privacy: '/privacy',
  terms: '/terms',
};

// ---------- PRODUCT DATA ----------
const PRODUCTS = [
  {
    name: 'NAD+',
    aliases: ['NAD+', 'NAD Plus', 'NAD Injections'],
    hrefPattern: /nad/i,
    keyBenefits: ['Energy Boost', 'Fast Recovery', 'Longevity Support', 'Cellular Boost'],
  },
  {
    name: 'Glutathione',
    aliases: ['Glutathione', 'Glutathione Injections'],
    hrefPattern: /glutathione/i,
    keyBenefits: ['Detox Support', 'Radiant Skin', 'Cellular Health'],
  },
  {
    name: 'Sermorelin',
    aliases: ['Sermorelin', 'Sermorelin Injection'],
    hrefPattern: /sermorelin/i,
    keyBenefits: ['Muscle Tone', 'Fat Metabolism', 'Sleep Quality'],
  },
];

// ---------- CONTENT TOKENS ----------
// Strings that MUST be present on the homepage (from source content analysis)
const REQUIRED_HOMEPAGE_CONTENT = [
  'NAD+',
  'Glutathione',
  'Sermorelin',
  'Board Certified',
  'Questionnaire',
  'Free Shipping',
  'Trustpilot',
  'LegitScript',
  'How It Works',
  'Frequently',
];

// Trust / compliance signals
const TRUST_SIGNALS = {
  legitScript: /LegitScript/i,
  trustpilotRating: /(\d+\.?\d*)\s*\/\s*5.*Trustpilot/i,
  boardCertified: /Board[- ]Certified/i,
  usBased: /US[- ]based|United States|USA|U\.S\./i,
  licensedProvider: /licensed\s+provider/i,
};

// FAQ expected keywords (must appear in the FAQ section)
const FAQ_EXPECTED_QUESTIONS = [
  'What is Snappy Scripts',
  'How much does Snappy Scripts cost',
  'How Does This Work',
  'Do I Need a Prescription',
  'Can I return my medications',
  'How Fast is Shipping',
  'How Much is Shipping',
  'Is My Information Safe',
  'Can I Use My Health Insurance',
];

// ---------- VIEWPORTS ----------
const VIEWPORTS = {
  desktop2K:   { width: 2560, height: 1440, isMobile: false, hasTouch: false, label: '2K' },
  desktop4K:   { width: 3840, height: 2160, isMobile: false, hasTouch: false, label: '4K' },
  ipadPro129:  { width: 1024, height: 1366, isMobile: true,  hasTouch: true,  label: 'iPad Pro 12.9' },
  ipadMini:    { width: 768,  height: 1024, isMobile: true,  hasTouch: true,  label: 'iPad Mini' },
  iphone14Pro: { width: 393,  height: 852,  isMobile: true,  hasTouch: true,  label: 'iPhone 14 Pro' },
  iphoneSE:    { width: 375,  height: 667,  isMobile: true,  hasTouch: true,  label: 'iPhone SE' },
};

// ---------- PERFORMANCE THRESHOLDS ----------
const PERF_THRESHOLDS = {
  lighthouse: {
    performance: 70,
    accessibility: 80,
    bestPractices: 80,
    seo: 80,
  },
  coreWebVitals: {
    lcp: 4000,   // ms
    cls: 0.25,   // unitless
    tbt: 600,    // ms
    fcp: 3000,   // ms
  },
  custom: {
    fullLoadMs: 8000,
  },
};

// ---------- SECURITY EXPECTATIONS ----------
const SECURITY_HEADERS = {
  required: {
    'strict-transport-security': {
      validate: (v) => !!v && v.includes('max-age='),
      description: 'HSTS — forces HTTPS (must include max-age)',
    },
    'x-content-type-options': {
      validate: (v) => v === 'nosniff',
      description: 'MIME sniffing protection',
    },
  },
  recommended: {
    'content-security-policy': {
      validate: (v) => !!v && !v.includes("'unsafe-eval'"),
      description: 'CSP — XSS mitigation',
    },
    'x-frame-options': {
      validate: (v) => !!v && /DENY|SAMEORIGIN/i.test(v),
      description: 'Clickjacking protection',
    },
    'referrer-policy': {
      validate: (v) => !!v && v !== 'unsafe-url',
      description: 'Referrer information control',
    },
    'permissions-policy': {
      validate: (v) => !!v && v.length > 0,
      description: 'Browser feature restrictions',
    },
  },
  disclosureHeaders: [
    'x-powered-by',
    'x-aspnet-version',
    'x-aspnetmvc-version',
    'server',
  ],
};

// ---------- XSS PAYLOADS ----------
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  "javascript:alert(1)",
];

// ---------- COMMON SELECTORS ----------
const SELECTORS = {
  nav: 'nav, header',
  mainHeading: 'h1',
  productLinks: 'a[href*="nad"], a[href*="glutathione"], a[href*="sermorelin"]',
  questionnaireCta: 'a:has-text("Questionnaire"), button:has-text("Questionnaire"), a:has-text("Get Started"), a:has-text("Start")',
  faqSection: 'section:has-text("Frequently"), div:has-text("FAQ"), [id*="faq" i], [class*="faq" i]',
  trustBadge: 'img[src*="legit" i], img[alt*="Legit" i], [class*="legit" i]',
  footer: 'footer',
};

module.exports = {
  BASE_URL,
  ROUTES,
  PRODUCTS,
  REQUIRED_HOMEPAGE_CONTENT,
  TRUST_SIGNALS,
  FAQ_EXPECTED_QUESTIONS,
  VIEWPORTS,
  PERF_THRESHOLDS,
  SECURITY_HEADERS,
  XSS_PAYLOADS,
  SELECTORS,
};