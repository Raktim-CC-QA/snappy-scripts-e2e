// tests/08-full-order-flow.spec.js
/**
 * Full Order Flow E2E Test (v22)
 * ==============================
 * v23 — APPROVED-CHECKOUT FIXES (from CI run #8: approvedCheckout advanced=false,
 *   page stuck on "Your Treatment Details" / "Dosage Tailored To Your Treatment Plan"):
 *   - K1 selectDosageIfPresent(): explicitly picks a dosage option in the Dosage section
 *   - K2 fillBasicDetails() accepts a skip regex; on the approved page promo/coupon/
 *        discount/referral/gift inputs are NOT filled with "Test" (it could invalidate
 *        the already-applied code SNAPPY180 and block the final button)
 *   - K3 validation errors are logged after every click without progress / no button
 *   - K4 the CI failure message now carries the visible buttons/inputs + validation errors
 *
 * v22.1 — DIAGNOSTICS: when the order is not completed, STEP 7 now logs every
 *   visible input/button, saves step7-final-state.png/.html and puts the
 *   approved-checkout result + a page snippet in the assertion message, and
 *   completeApprovedCheckout() logs the visible controls when it gives up.
 *
 * v22 CHANGES — building on v21:
 *
 *  FIX J1 — verification wizard on the same /approved-secure-checkout URL
 *  ----------------------------------------------------------------------
 *  STEP 6.5 used to test isApprovedCheckoutPage() BEFORE the verification
 *  wizard. If the wizard renders on the same URL, the URL regex kept matching,
 *  completeVerification() never ran and STEP 7 failed with that URL. Now the
 *  wizard is checked first, and an approved-checkout "verification" handoff
 *  runs completeVerification() immediately.
 *
 *  FIX J2 — maximizeBrowser only on headed desktop Chromium
 *  --------------------------------------------------------
 *  The CDP call fails on Firefox, and the fallback resized the viewport to the
 *  screen size, which broke iPhone emulation. It is now skipped on non-Chromium,
 *  mobile projects and CI.
 *
 *  FIX J3 — wait for "Cancel Treatment" before judging the order
 *  -------------------------------------------------------------
 *  cancelAvailable used to be read instantly after the last click. It now waits
 *  up to 8s via waitForCancelTrigger().
 *
 * v21 CHANGES — building on v20:
 *
 *  FIX I1 — delivery address never really got selected
 *  ---------------------------------------------------
 *  The old code used fill() (no key events) so Google-style autocomplete never
 *  opened, then pressed ArrowDown+Enter on an empty list. selectDeliveryAddress():
 *    - types the query slowly with real key events (pressSequentially),
 *    - waits for a suggestion list (.pac-item / listbox options / custom <li>),
 *    - clicks the first suggestion and VERIFIES the field changed,
 *    - retries with fallback queries (CONFIG.payment.addressFallbacks),
 *    - falls back to typing street / city / state / zip by hand,
 *    - clicks "Use this address / Confirm address" prompts if they appear.
 *  The address input is found by role/placeholder/name, so it also works on
 *  any other page that shows it.
 *
 *  FIX I2 — second checkout page (/nd-in-approved-secure-checkout)
 *  ----------------------------------------------------------------
 *  After the first "Complete Checkout" the app now lands on a "Your Treatment
 *  Details" page (dosage, address, etc.). completeApprovedCheckout() handles it
 *  (address -> card fields -> consents/answers -> final button), logs every
 *  visible input/button for debugging, and stops when the order is placed, a
 *  verification wizard appears or "Cancel Treatment" is visible. STEP 6.5 now
 *  loops between this page and the verification wizard.
 *
 * v20 CHANGES — building on v19:
 *
 *  FIX H1 — "app reacts faster / elements missed" (the sub-step 13 failure)
 *  ------------------------------------------------------------------------
 *  After "Continue to see if you qualify" the app now swaps to the signup
 *  form (first/last/email/state/phone) a moment AFTER the loop had already
 *  inspected the page, so the form was never detected and Continue stayed
 *  disabled. Fixes:
 *    - waitForPageSettled(): at the start of every sub-step (and before every
 *      retry pass) wait for network idle, spinners to vanish, at least one
 *      actionable control to exist and the DOM to stop changing.
 *    - handleSignupIfPresent(): the signup form is now checked at the top of
 *      each sub-step AND inside every retry pass (not once-only), so a form
 *      that renders late is still filled and submitted.
 *    - Retry passes (2..5) re-run the text/select/consent fillers too.
 *    - Before the loop gives up, one last settle + signup + fill rescue.
 *
 *  NEW H2 — email + order ID printed after cancelling
 *  --------------------------------------------------
 *  The order ID is harvested from the confirmation URL/page, the API JSON
 *  responses, the cancel page and (best source) the Order History row that
 *  shows "Cancelled". printCancelledOrderSummary() logs the email + order ID
 *  right after the cancellation, again at the end, and saves
 *  test-results/flow-steps/cancelled-order.json.
 *
 *  Everything else (maximize, verification wizard + uploads, plan/checkout,
 *  popup dismissal, semantic questionnaire, Cancel Treatment, Order History
 *  check) is unchanged from v19.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

test.setTimeout(540000);

const CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'https://staging.snappyscripts.com',
  credentials: {
    email: process.env.TEST_EMAIL || `qa+${Date.now()}@yopmail.com`,
    password: process.env.TEST_PASSWORD || 'TestPass123!',
  },
  patient: {
    firstName: process.env.TEST_FIRST_NAME || 'QA',
    lastName: process.env.TEST_LAST_NAME || 'Tester',
    dob: process.env.TEST_DOB || '01/01/1990',
    dobMonth: process.env.TEST_DOB_MONTH || '10',
    dobDay: process.env.TEST_DOB_DAY || '10',
    dobYear: process.env.TEST_DOB_YEAR || '1997',
    phone: process.env.TEST_PHONE || '(212) 555-1234',
    address: process.env.TEST_ADDRESS || '123 Test St',
    city: process.env.TEST_CITY || 'Testville',
    state: process.env.TEST_STATE || 'IA',
    zip: process.env.TEST_ZIP || '90210',
    height: '70',
    weight: '199',
    age: '35',
    ssnLast4: process.env.TEST_SSN_LAST4 || '1234',
  },
  payment: {
    cardName: 'Test',
    cardNumber: '0000 0000 0000 0000',
    expiry: '12/34',
    cvv: '567',
    addressQuery: process.env.TEST_ADDRESS_QUERY || 'test',
    // tried in order if the first query never yields a selectable suggestion
    addressFallbacks: ['6202 E Test Dr', '6202 E Test Dr Mesa AZ'],
  },
  // Optional real image files. If unset/missing, placeholders are generated.
  uploads: {
    idFront: process.env.TEST_ID_FRONT || '',
    idBack: process.env.TEST_ID_BACK || '',
    selfie: process.env.TEST_SELFIE || '',
  },
  timeouts: { short: 4000, medium: 12000, long: 30000, checkout: 60000 },
};

const CHECKOUT_URL_RE = /checkout|payment|confirm|review|order|cart|personalize-plan/i;

const SAFE_ANSWERS = [
  { match: /pregnan|breastfeed/i,              prefer: /none of the below|^none$/i,     multi: false },
  { match: /suffer from.*medical condition|medical condition/i,
                                               prefer: /none of the below|^none$/i,     multi: true  },
  { match: /safety first|do you have|are you currently|have you ever|do you take|do you use/i,
                                               prefer: /^no$/i,                        multi: false },
  { match: /cancer/i,                          prefer: /^no$/i,                        multi: false },
  { match: /autoimmune/i,                      prefer: /^no$/i,                        multi: false },
  { match: /allergic reaction.*(nad|nad\+|nad components)/i,
                                               prefer: /^no$/i,                        multi: false },
  { match: /drug allerg/i,                     prefer: /none|^no$/i,                   multi: true  },
  { match: /anything else.*doctor|tell.*doctor/i,
                                               prefer: /^no$/i,                        multi: false },
  { match: /what is your gender|gender/i,      prefer: /^male$/i,                      multi: false },
  { match: /overall health/i,                  prefer: /^good$|^excellent$/i,          multi: false },
  { match: /how can we help you feel your best|help you feel/i,
                                               prefer: /more energy|focus/i,           multi: true  },
  { match: /email consent/i,                   prefer: /yes|agree|consent/i,           multi: false },
  { match: /sms consent|text consent/i,        prefer: /yes|agree|consent/i,           multi: false },
  { match: /consent|agree|terms/i,             prefer: /yes|agree|consent|accept/i,    multi: false },
  { match: /./,                                prefer: /^no$|none of the below|^none$|^good$|^male$/i, multi: false },
];

const SHOTS_DIR = path.join('test-results', 'flow-steps');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
const FIXTURES_DIR = path.join('test-results', 'upload-fixtures');
fs.mkdirSync(FIXTURES_DIR, { recursive: true });

let STEP = 0;
async function snapshot(page, label) {
  STEP += 1;
  const file = path.join(SHOTS_DIR, `${String(STEP).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`   📸 ${file}`);
}
async function dumpDom(page, label) {
  const file = path.join(SHOTS_DIR, `${label}.html`);
  const html = await page.content().catch(() => '');
  fs.writeFileSync(file, html);
  console.log(`   🧾 DOM dumped: ${file}`);
}
async function log(step, msg) { console.log(`\n[${step}] ${msg}`); }

/* =====================================================================
 * v20 H2 — RUN STATE: email + order ID tracking
 * ===================================================================== */

let LAST_CONTROLS = { inputs: [], buttons: [] };

const RUN = {
  email: '',            // email actually typed into the signup form
  orderIds: [],         // [{ id, source, priority }]
  cancelled: false,
};

// Higher number = more trustworthy source.
const ORDER_SOURCE_PRIORITY = {
  'order-history': 50,
  'cancel-page': 40,
  'confirmation': 30,
  'url': 20,
  'api': 10,
  'order-history-page': 5,
};

const ORDER_ID_TEXT_RES = [
  /order\s*(?:id|number|no\.?|ref(?:erence)?)\s*[:#\-]?\s*#?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,})/i,
  /order\s*#\s*([A-Za-z0-9][A-Za-z0-9_-]{2,})/i,
  /#\s*([A-Z0-9][A-Z0-9_-]*\d[A-Z0-9_-]*)/,
];

/** Pull an order ID out of free text and/or a URL. Must contain a digit. */
function extractOrderId(text, url = '') {
  if (url) {
    const q = url.match(/[?&](?:order[_-]?id|orderId|order[_-]?number|order|oid)=([A-Za-z0-9_-]*\d[A-Za-z0-9_-]*)/i);
    if (q) return { id: q[1], source: 'url' };
    const p = url.match(/\/orders?\/([A-Za-z0-9_-]*\d[A-Za-z0-9_-]*)/i);
    if (p) return { id: p[1], source: 'url' };
  }
  const t = String(text || '');
  for (const re of ORDER_ID_TEXT_RES) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of t.matchAll(g)) {
      if (m[1] && /\d/.test(m[1])) return { id: m[1], source: 'text' };
    }
  }
  return null;
}

function recordOrderId(id, source) {
  if (!id) return;
  if (RUN.orderIds.some(o => o.id === id && o.source === source)) return;
  RUN.orderIds.push({ id, source, priority: ORDER_SOURCE_PRIORITY[source] || 0 });
  console.log(`      🧾 Order ID candidate "${id}" (source: ${source})`);
}

function bestOrderId() {
  if (!RUN.orderIds.length) return null;
  return [...RUN.orderIds].sort((a, b) => b.priority - a.priority)[0];
}

/** Look at the current URL + body text and record any order ID found. */
async function captureOrderIdFromPage(page, source) {
  const body = await page.locator('body').innerText().catch(() => '');
  const hit = extractOrderId(body, page.url());
  if (hit) recordOrderId(hit.id, hit.source === 'url' ? 'url' : source);
  return hit ? hit.id : null;
}

function currentEmail() {
  return RUN.email || CONFIG.credentials.email;
}

function printCancelledOrderSummary(label) {
  const best = bestOrderId();
  const email = currentEmail();
  const line = '═'.repeat(60);
  console.log(`\n${line}`);
  console.log(` 🛑 ${label}`);
  console.log(`${line}`);
  console.log(` 📧 Email ID : ${email}`);
  console.log(` 🧾 Order ID : ${best ? best.id : 'NOT FOUND (see order-history / cancel-treatment artifacts)'}`);
  if (best) console.log(`    (source: ${best.source})`);
  if (RUN.orderIds.length > 1) {
    console.log(`    other candidates: ${RUN.orderIds.map(o => `${o.id} [${o.source}]`).join(', ')}`);
  }
  console.log(` ✅ Cancelled: ${RUN.cancelled ? 'yes (confirmed in app)' : 'clicked — see Order History result'}`);
  console.log(`${line}\n`);
  try {
    fs.writeFileSync(
      path.join(SHOTS_DIR, 'cancelled-order.json'),
      JSON.stringify({
        email,
        orderId: best ? best.id : null,
        orderIdSource: best ? best.source : null,
        candidates: RUN.orderIds,
        cancelled: RUN.cancelled,
        at: new Date().toISOString(),
      }, null, 2)
    );
  } catch {}
}

/* ===================================================================== */

async function clickIfVisible(locator, timeout = CONFIG.timeouts.short, { requireEnabled = true } = {}) {
  try {
    const el = locator.first();
    await el.waitFor({ state: 'visible', timeout });
    if (requireEnabled && !(await el.isEnabled().catch(() => false))) return false;
    await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await el.click({ timeout });
    return true;
  } catch { return false; }
}
async function fillIfVisible(locator, value, timeout = CONFIG.timeouts.short) {
  try {
    const el = locator.first();
    await el.waitFor({ state: 'visible', timeout });
    if (!(await el.isEnabled().catch(() => false))) return false;
    await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await el.fill(value, { timeout });
    return true;
  } catch { return false; }
}

/**
 * v18 FIX F1 — maximize the headed Chrome window via CDP.
 * Falls back to resizing the viewport to the screen's available size.
 * v22 FIX J2: the caller only invokes this on headed desktop Chromium.
 */
async function maximizeBrowser(page, context) {
  try {
    const session = await context.newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'maximized' },
    });
    await session.detach().catch(() => {});
    await page.waitForTimeout(500); // let the layout settle
    console.log('   ✓ Browser window maximized (CDP)');
    return true;
  } catch (e) {
    try {
      const { w, h } = await page.evaluate(() => ({
        w: window.screen.availWidth,
        h: window.screen.availHeight,
      }));
      await page.setViewportSize({ width: w, height: h });
      console.log(`   ✓ Viewport resized to ${w}x${h} (CDP unavailable: ${e.message.split('\n')[0]})`);
      return true;
    } catch {
      console.warn('   ⚠ Could not maximize browser');
      return false;
    }
  }
}

/**
 * v20 FIX H1 — wait until the page has really finished rendering the
 * current step: network quiet, spinners gone, something actionable present,
 * and the DOM no longer changing. Prevents acting on a half-rendered step.
 */
async function waitForPageSettled(page, { timeout = 8000 } = {}) {
  const start = Date.now();
  await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

  // spinners / loaders / skeletons
  const loaders = page.locator(
    '[class*="spinner" i]:visible, [class*="loader" i]:visible, [class*="loading" i]:visible, ' +
    '[class*="skeleton" i]:visible, [role="progressbar"]:visible'
  );
  const loaderDeadline = Date.now() + 4000;
  while (Date.now() < loaderDeadline) {
    const n = await loaders.count().catch(() => 0);
    if (!n) break;
    await page.waitForTimeout(250);
  }

  // at least one actionable control
  const actionable = page.locator(
    'input:visible, select:visible, textarea:visible, [role="radio"]:visible, ' +
    '.custom-radio-circle:visible, .option-card:visible, .list-item-row:visible, button:visible'
  );
  while (Date.now() - start < timeout) {
    if ((await actionable.count().catch(() => 0)) > 0) break;
    await page.waitForTimeout(200);
  }

  // DOM stability: signature must be identical on 2 consecutive reads
  let prev = '';
  let stable = 0;
  while (Date.now() - start < timeout && stable < 2) {
    const sig = await page.evaluate(() => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const st = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
      };
      const ctrls = Array.from(document.querySelectorAll('input,select,textarea,button')).filter(vis).length;
      return `${(document.body.innerText || '').length}|${ctrls}|${location.href}`;
    }).catch(() => '');
    if (sig === prev) stable++;
    else { stable = 0; prev = sig; }
    await page.waitForTimeout(300);
  }
}

/**
 * v15 FIX C1 — aggressive popup dismissal.
 */
async function dismissOverlays(page) {
  let dismissed = 0;

  // Strategy 1 — known cookie/consent buttons.
  const knownDismissers = [
    'button:has-text("Accept")', 'button:has-text("I agree")',
    'button:has-text("Got it")', 'button:has-text("No thanks")',
    'button:has-text("No, thanks")', 'button:has-text("Maybe later")',
    'button:has-text("Not now")', 'button:has-text("Skip")',
    'button:has-text("Continue shopping")', 'button:has-text("Dismiss")',
    'button:has-text("Close")', 'button:has-text("×")',
    'button[aria-label*="close" i]', 'button[aria-label*="dismiss" i]',
    '[data-testid="cookie-accept"]', '[data-dismiss="modal"]',
    '.modal-close', '.close-button', '.popup-close', '.dialog-close',
  ];
  for (const sel of knownDismissers) {
    try {
      const loc = page.locator(sel).filter({ visible: true });
      const n = await loc.count().catch(() => 0);
      for (let i = n - 1; i >= 0; i--) {
        const el = loc.nth(i);
        if (!(await el.isVisible({ timeout: 300 }).catch(() => false))) continue;
        if (!(await el.isEnabled().catch(() => false))) continue;
        await el.click({ timeout: 1500, force: true }).catch(() => {});
        dismissed++;
        console.log(`   → Dismissed overlay: ${sel}`);
        await page.waitForTimeout(150);
        break;
      }
    } catch {}
  }

  // Strategy 2 — any visible button whose text is a dismiss verb.
  try {
    const candidates = await page.locator('button:visible, [role="button"]:visible').all();
    for (const btn of candidates) {
      const txt = ((await btn.innerText().catch(() => '')) || '').trim();
      if (!txt) continue;
      if (/^(×|✕|✗|✖|x|close|dismiss|no thanks|no, thanks|maybe later|not now|got it|skip|continue shopping)$/i.test(txt)) {
        const box = await btn.boundingBox().catch(() => null);
        if (!box) continue;
        if (box.width > 260 || box.height > 90) continue;
        await btn.click({ timeout: 1200, force: true }).catch(() => {});
        dismissed++;
        console.log(`   → Dismissed overlay (text="${txt}")`);
        await page.waitForTimeout(150);
      }
    }
  } catch {}

  // Strategy 3 — aria-label / title / class matching close.
  try {
    const closers = await page.locator(
      '[aria-label*="close" i]:visible, [aria-label*="dismiss" i]:visible, ' +
      '[title*="close" i]:visible, [class*="close" i]:visible, [class*="dismiss" i]:visible'
    ).all();
    for (const el of closers) {
      const tag = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => '');
      if (tag !== 'button' && tag !== 'a' && tag !== 'span' && tag !== 'div' && tag !== 'i') continue;
      const box = await el.boundingBox().catch(() => null);
      if (!box) continue;
      if (box.width > 120 || box.height > 120) continue;
      await el.click({ timeout: 1000, force: true }).catch(() => {});
      dismissed++;
      console.log(`   → Dismissed overlay (tag=${tag})`);
      await page.waitForTimeout(120);
    }
  } catch {}

  // Strategy 4 — remove leftover modal backdrops that block clicks.
  try {
    const removed = await page.evaluate(() => {
      let count = 0;
      const sels = [
        '[class*="backdrop" i]',
        '[class*="modal-mask" i]',
        '[class*="overlay" i]',
        '[class*="popup" i][class*="mask" i]',
      ];
      for (const s of sels) {
        document.querySelectorAll(s).forEach(el => {
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') return;
          const r = el.getBoundingClientRect();
          if (r.width < window.innerWidth * 0.6 || r.height < window.innerHeight * 0.6) return;
          const txt = (el.innerText || '').trim();
          if (txt.length > 40) return;
          el.style.pointerEvents = 'none';
          el.style.display = 'none';
          count++;
        });
      }
      return count;
    }).catch(() => 0);
    if (removed) {
      dismissed += removed;
      console.log(`   → Neutralized ${removed} backdrop element(s)`);
    }
  } catch {}

  // Strategy 5 — Escape key as last resort (only if something was open).
  if (dismissed > 0) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(120);
  }

  return dismissed;
}

async function tryFirst(candidates, timeout = 2500) {
  for (const loc of candidates) if (await clickIfVisible(loc, timeout)) return loc;
  return null;
}
async function findInteractiveRoot(page) {
  const dialog = page.locator('dialog[open], [role="dialog"]:visible, [class*="modal" i]:visible').first();
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) return dialog;
  return page.locator('body');
}

async function extractQuestions(page) {
  return await page.evaluate(() => {
    const optionSelector = [
      'input[type="radio"]',
      'input[type="checkbox"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[role="option"]',
      '[aria-pressed]',
      '[data-selected]',
      '.custom-radio-circle',
      '.custom-checkbox',
      '.list-item-row',
      '.option-card',
      '[class*="options-grid" i] > div',
      'button[class*="option" i]',
      'button[class*="card" i]',
      'button[class*="choice" i]',
      '[class*="option" i]:not(button)',
      '[class*="choice" i]:not(button)',
      '[class*="answer" i]:not(button)',
      '[class*="radio" i]:not(button)',
      '[class*="checkbox" i]:not(button)',
      'label[class*="option" i]',
      '[data-testid*="option" i]',
      '[data-option]',
      '[data-value]',
      '[data-answer]',
    ].join(',');

    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    let optionEls = Array.from(document.querySelectorAll(optionSelector)).filter(isVisible);

    {
      const elSet = new Set(optionEls);
      const ancestorsToDrop = new Set();
      optionEls.forEach(el => {
        let p = el.parentElement;
        while (p) {
          if (elSet.has(p)) ancestorsToDrop.add(p);
          p = p.parentElement;
        }
      });
      optionEls = optionEls.filter(el => !ancestorsToDrop.has(el));
    }

    const groups = new Map();
    for (const el of optionEls) {
      const tagName = el.tagName;
      const role = el.getAttribute('role') || '';
      const hasOnclick = !!el.onclick;
      const tabIndex = el.getAttribute('tabindex');
      const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
      const isNativeForm = tagName === 'INPUT' || tagName === 'LABEL' || tagName === 'BUTTON';
      const looksWidget =
        isNativeForm ||
        role === 'radio' || role === 'checkbox' || role === 'option' ||
        el.hasAttribute('aria-pressed') || el.hasAttribute('data-selected') ||
        el.hasAttribute('data-value') || el.hasAttribute('data-answer') || el.hasAttribute('data-option') ||
        cls.includes('custom-radio') || cls.includes('custom-checkbox') ||
        cls.includes('list-item') || cls.includes('option-card') ||
        cls.includes('option-row') || cls.includes('answer-row') || cls.includes('choice');

      if (!looksWidget && !hasOnclick && tabIndex === null) {
        const inner = (el.innerText || '').trim();
        const nestedOptionChildren = el.querySelectorAll(
          'input[type="radio"], input[type="checkbox"], .custom-radio-circle, [role="radio"], [role="option"]'
        ).length;
        if (!inner || inner.length > 120 || nestedOptionChildren > 0) continue;
      }

      let container = el.closest('[data-question], fieldset, [role="group"], [role="radiogroup"], form > div, [class*="question-block" i], [class*="question-block" i]');
      if (!container) container = el.closest('.question-block, [class*="question-block" i]');
      if (!container) container = el.parentElement;

      let qText = '';
      let p = container;
      for (let i = 0; i < 4 && p; i++) {
        const t = p.innerText?.trim().slice(0, 300) || '';
        if (t.length > qText.length) qText = t;
        p = p.parentElement;
      }

      const key = container ? (container.getAttribute('data-question') || container.id || container.className) : 'default';
      if (!groups.has(key)) groups.set(key, { key, text: qText, options: [] });
      const group = groups.get(key);

      let label = '';
      if (tagName === 'INPUT') {
        const id = el.id;
        if (id) {
          const l = document.querySelector(`label[for="${id}"]`);
          if (l) label = l.innerText.trim();
        }
        if (!label && el.labels && el.labels[0]) label = el.labels[0].innerText.trim();
      }
      if (!label) label = (el.innerText || el.textContent || '').trim().slice(0, 100);
      if (!label && cls.includes('custom-radio')) {
        const card = el.closest('[class*="option-card" i]') || el.closest('label, div');
        if (card) {
          const lbl = card.querySelector('.option-label, span');
          if (lbl) label = (lbl.innerText || lbl.textContent || '').trim().slice(0, 100);
          if (!label) label = (card.innerText || card.textContent || '').trim().slice(0, 100);
        }
      }
      if (!label) continue;

      const alreadyInGroup = group.options.some(o => o.label === label && o.tag === tagName);
      if (!alreadyInGroup) {
        group.options.push({
          label,
          tag: tagName,
          type: el.type || role || '',
          checked: el.checked ||
            el.getAttribute('aria-checked') === 'true' ||
            el.getAttribute('aria-pressed') === 'true' ||
            el.getAttribute('aria-selected') === 'true' ||
            el.getAttribute('data-selected') === 'true' ||
            el.getAttribute('data-checked') === 'true' ||
            (cls && (cls.includes('selected') || cls.includes('active') || cls.includes('checked'))),
        });
      }
    }

    return Array.from(groups.values()).filter(g => g.options.length > 0);
  }).catch(() => []);
}

function dedupeGroups(groups) {
  const merged = new Map();
  for (const g of groups) {
    const norm = (g.text || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 160);
    const key = norm || g.key;
    if (!merged.has(key)) {
      merged.set(key, { key, text: g.text, options: [...g.options] });
    } else {
      const existing = merged.get(key);
      for (const opt of g.options) {
        const dup = existing.options.some(o => o.label === opt.label && o.tag === opt.tag);
        if (!dup) existing.options.push(opt);
      }
    }
  }
  return Array.from(merged.values());
}

async function isOptionSelected(page, label) {
  return await page.evaluate((lbl) => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const target = norm(lbl);
    if (!target) return false;
    const candidates = document.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"], [aria-pressed], [data-selected], .custom-radio-circle, .custom-checkbox, .list-item-row, .option-card, [data-value], [data-answer]'
    );
    for (const el of candidates) {
      let text = '';
      if (el.id) {
        const l = document.querySelector(`label[for="${el.id}"]`);
        if (l) text = norm(l.innerText);
      }
      if (!text && el.labels && el.labels[0]) text = norm(el.labels[0].innerText);
      if (!text) text = norm(el.innerText || el.textContent);
      if (!text) {
        const card = el.closest('[class*="option-card" i]') || el.closest('label, div');
        if (card) {
          const lbl = card.querySelector('.option-label, span');
          if (lbl) text = norm(lbl.innerText || lbl.textContent);
          if (!text) text = norm(card.innerText || card.textContent);
        }
      }
      if (text && (text === target || text.includes(target) || target.includes(text))) {
        const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
        const parent = el.closest('[class*="option-card" i]');
        const parentCls = parent ? (parent.className || '').toLowerCase() : '';
        return el.checked === true ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-pressed') === 'true' ||
          el.getAttribute('aria-selected') === 'true' ||
          el.getAttribute('data-selected') === 'true' ||
          el.getAttribute('data-checked') === 'true' ||
          (cls && (cls.includes('selected') || cls.includes('active') || cls.includes('checked'))) ||
          (parentCls && (parentCls.includes('selected') || parentCls.includes('active') || parentCls.includes('checked')));
      }
    }
    return false;
  }, label).catch(() => false);
}

async function answerGroupByRule(page, group, rule) {
  const options = group.options;
  const prefer = rule.prefer;

  let match = options.find(o => /none of the below/i.test(o.label));
  if (!match && prefer) match = options.find(o => prefer.test(o.label));
  if (!match) match = options.find(o => !o.checked);
  if (!match) return { clicked: false, reason: 'no-matching-option', label: null };

  if (await isOptionSelected(page, match.label)) {
    return { clicked: true, label: match.label, reason: 'already-selected' };
  }

  const quoted = escapeQuotes(match.label);

  const byText = page.locator(
    `label:has-text("${quoted}"), button:has-text("${quoted}"), [role="radio"]:has-text("${quoted}"), [role="checkbox"]:has-text("${quoted}"), [role="option"]:has-text("${quoted}"), [aria-pressed]:has-text("${quoted}"), [data-selected]:has-text("${quoted}"), .custom-radio-circle:has-text("${quoted}"), .list-item-row:has-text("${quoted}"), .option-card:has-text("${quoted}"), [class*="option" i]:has-text("${quoted}")`
  ).filter({ visible: true }).first();

  if (await byText.isVisible({ timeout: 1200 }).catch(() => false)) {
    await byText.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    const clicked = await byText.click({ timeout: 2000 }).then(() => true).catch(() => false);
    if (clicked) {
      await page.waitForTimeout(150);
      if (await isOptionSelected(page, match.label)) {
        return { clicked: true, label: match.label, reason: 'text-match' };
      }
      const wrapperClicked = await page.evaluate((lbl) => {
        const norm = s => (s || '').replace(/\s+/g, ' ').trim();
        const target = norm(lbl);
        const nodes = Array.from(document.querySelectorAll('label, div, button, span, li'));
        const hit = nodes.find(n => norm(n.innerText || n.textContent) === target);
        if (!hit) return false;
        const wrap = hit.closest('[class*="option-card" i]') || hit.closest('label') || hit.parentElement;
        if (wrap) { wrap.click(); return true; }
        hit.click();
        return true;
      }, match.label).catch(() => false);
      if (wrapperClicked) {
        await page.waitForTimeout(150);
        if (await isOptionSelected(page, match.label)) {
          return { clicked: true, label: match.label, reason: 'wrapper-match' };
        }
      }
      return { clicked: true, label: match.label, reason: 'text-match-unverified' };
    }
  }

  const byRole = page.getByRole('radio', { name: new RegExp(escapeRegex(match.label), 'i') })
    .or(page.getByRole('checkbox', { name: new RegExp(escapeRegex(match.label), 'i') }))
    .or(page.getByRole('option', { name: new RegExp(escapeRegex(match.label), 'i') }))
    .or(page.getByRole('button', { name: new RegExp(escapeRegex(match.label), 'i') }))
    .first();
  if (await byRole.isVisible({ timeout: 1000 }).catch(() => false)) {
    await byRole.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    const clicked = await byRole.click({ timeout: 2000 }).then(() => true).catch(() => false);
    if (clicked) return { clicked: true, label: match.label, reason: 'role-match' };
  }

  return { clicked: false, reason: 'no-locator', label: match.label };
}

function escapeQuotes(s) {
  return String(s || '').replace(/"/g, '\\"').slice(0, 80);
}
function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
}

async function answerBySemantics(page, scope) {
  const rawGroups = await extractQuestions(page);
  const groups = dedupeGroups(rawGroups);
  if (!groups.length) return 0;
  console.log(`      🧠 Found ${groups.length} question group(s)${rawGroups.length !== groups.length ? ` (merged from ${rawGroups.length} raw match${rawGroups.length === 1 ? '' : 'es'})` : ''}`);

  let clickedCount = 0;
  for (const g of groups) {
    const rule = SAFE_ANSWERS.find(r => r.match.test(g.text || '')) || SAFE_ANSWERS[SAFE_ANSWERS.length - 1];
    const result = await answerGroupByRule(page, g, rule);
    if (result.clicked) {
      const tag = result.reason === 'already-selected' ? ' (already selected)' : '';
      console.log(`      ✓ Q: "${(g.text || '').replace(/\s+/g, ' ').slice(0, 60)}" → "${result.label}"${tag}`);
      clickedCount++;
    } else {
      console.log(`      ⚠ Q: "${(g.text || '').replace(/\s+/g, ' ').slice(0, 60)}" → NOT CLICKED (${result.reason})`);
    }
  }
  return clickedCount;
}

async function fillDobSelects(page, scope, patient) {
  const selects = await scope.locator('select:visible').all();
  if (selects.length < 3) return 0;

  const monthSel = selects[selects.length - 3];
  const daySel   = selects[selects.length - 2];
  const yearSel  = selects[selects.length - 1];

  const MONTH_LABELS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const monthIdx   = Math.max(1, Math.min(12, parseInt(patient.dobMonth, 10) || 1));
  const monthLabel = MONTH_LABELS[monthIdx - 1];
  const monthRe    = new RegExp(`^${monthLabel}`, 'i');
  const yearValue  = String(patient.dobYear);
  const dayValue   = String(parseInt(patient.dobDay, 10) || 1);

  let filled = 0;

  try { await monthSel.selectOption({ label: monthRe }); filled++; }
  catch {
    try { await monthSel.selectOption({ index: monthIdx }); filled++; }
    catch { await monthSel.selectOption({ value: String(monthIdx) }).catch(() => {}); filled++; }
  }
  await page.waitForTimeout(500);

  const start = Date.now();
  while (Date.now() - start < 2000) {
    const n = await daySel.locator('option').count().catch(() => 0);
    if (n > 1) break;
    await page.waitForTimeout(150);
  }
  try { await daySel.selectOption({ value: dayValue }); filled++; }
  catch {
    try { await daySel.selectOption({ label: dayValue }); filled++; }
    catch { await daySel.selectOption({ index: parseInt(dayValue, 10) }).catch(() => {}); filled++; }
  }

  try { await yearSel.selectOption({ value: yearValue }); filled++; }
  catch { await yearSel.selectOption({ label: yearValue }).catch(() => {}); filled++; }

  return filled;
}

async function forceClickUnselectedWidgets(page, scope) {
  const clicked = await page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 5 && r.height > 5;
    };
    const selector = [
      '.custom-radio-circle',
      '.custom-checkbox',
      '.option-card',
      '[role="radio"]',
      '[role="checkbox"]',
      '[aria-pressed]',
      '[data-selected]',
      '[data-value]',
      '[data-answer]',
      '[class*="option" i]',
      '[class*="choice" i]',
      '[class*="radio" i]',
      '[class*="checkbox" i]',
    ].join(',');

    let els = Array.from(document.querySelectorAll(selector)).filter(isVisible);

    const elSet = new Set(els);
    const ancestorsToDrop = new Set();
    els.forEach(el => {
      let p = el.parentElement;
      while (p) {
        if (elSet.has(p)) ancestorsToDrop.add(p);
        p = p.parentElement;
      }
    });
    els = els.filter(el => !ancestorsToDrop.has(el));

    const seenLabels = new Set();
    els = els.filter(el => {
      const label = (el.innerText || el.textContent || '').trim().slice(0, 80);
      if (!label) return true;
      const norm = label.toLowerCase();
      if (seenLabels.has(norm)) return false;
      seenLabels.add(norm);
      return true;
    });

    const groupKey = (el) => {
      const g = el.closest('[role="radiogroup"], fieldset, [data-question], [class*="question-block" i]');
      if (g) return g;
      let p = el.parentElement;
      while (p && p !== document.body) {
        const sibs = p.querySelectorAll(
          'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [aria-pressed], [data-selected], .custom-radio-circle, .custom-checkbox, .option-card, .list-item-row'
        );
        if (sibs.length > 1) return p;
        p = p.parentElement;
      }
      return el.parentElement || document.body;
    };

    const byGroup = new Map();
    for (const el of els) {
      const g = groupKey(el);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(el);
    }

    const isSelected = (el) => {
      const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
      const p = el.closest('[class*="option-card" i]');
      const pc = p ? (p.className || '').toLowerCase() : '';
      return el.checked === true ||
        (el.matches && el.matches(':checked')) ||
        el.getAttribute('aria-checked') === 'true' ||
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-selected') === 'true' ||
        el.getAttribute('data-selected') === 'true' ||
        el.getAttribute('data-checked') === 'true' ||
        cls.includes('selected') || cls.includes('active') || cls.includes('checked') ||
        pc.includes('selected') || pc.includes('active') || pc.includes('checked');
    };

    const preferNo = (el) => {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      return /^(no|none|neither|not sure|prefer not|n\/a)\b/.test(t) || /none of the below/.test(t);
    };
    const isYes = (el) => {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      return /^(yes|yep|yeah|y)\b/.test(t);
    };

    const hits = [];
    for (const [, group] of byGroup) {
      if (group.some(isSelected)) continue;
      let pick = group.find(preferNo);
      if (!pick) pick = group.find(el => !isYes(el)) || group[0];
      const label = (pick.innerText || pick.textContent || '').trim().slice(0, 60);
      if (!label) continue;
      try {
        pick.scrollIntoView({ block: 'center' });
        pick.click();
        hits.push(label);
      } catch {}
    }
    return hits;
  }).catch(() => []);

  if (clicked.length) {
    console.log(`      ⚡ forceClickUnselectedWidgets clicked ${clicked.length}: ${clicked.slice(0,5).join(' | ')}`);
  } else {
    console.log(`      ⚡ forceClickUnselectedWidgets found nothing to click`);
  }
  return clicked.length;
}

async function fillSnappyCustomWidgets(page, scope, patient, credentials) {
  let filled = 0;

  const weight = scope.locator('[role="spinbutton"][aria-label*="weight" i], input[name*="weight" i], input[aria-label*="weight" i]').first();
  if (await weight.isVisible({ timeout: 800 }).catch(() => false)) {
    const cur = await weight.inputValue().catch(() => '');
    if (!cur) {
      await weight.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
      await weight.click({ timeout: 1500 }).catch(() => {});
      await weight.fill(patient.weight).catch(() => {});
      filled++;
      console.log(`      ✓ Filled weight = ${patient.weight}`);
    }
  }

  const allSel = await scope.locator('select:visible').all();
  if (allSel.length >= 5) {
    await allSel[0].selectOption({ index: 1 }).catch(() => {});
    await allSel[1].selectOption({ index: 0 }).catch(() => {});
  }

  const dobFilled = await fillDobSelects(page, scope, patient);
  if (dobFilled) {
    filled += dobFilled;
    console.log(`      ✓ Filled DOB selects (${dobFilled}/3)`);
  }

  const circles = scope.locator('.custom-radio-circle');
  const circleCount = await circles.count().catch(() => 0);
  if (circleCount > 0) {
    const anySelected = await scope.evaluate(() => {
      return Array.from(document.querySelectorAll('.custom-radio-circle')).some(el => {
        const c = (el.className || '').toLowerCase();
        const p = el.closest('[class*="option-card" i]');
        const pc = p ? (p.className || '').toLowerCase() : '';
        return c.includes('selected') || c.includes('active') || c.includes('checked') ||
          pc.includes('selected') || pc.includes('active') || pc.includes('checked') ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('data-checked') === 'true';
      });
    }).catch(() => false);
    if (!anySelected) {
      await circles.first().scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
      await circles.first().click({ timeout: 1500 }).catch(() => {});
      filled++;
      console.log(`      ✓ Clicked first .custom-radio-circle`);
    }
  }

  const listRows = scope.locator('.list-item-row');
  const listCount = await listRows.count().catch(() => 0);
  if (listCount > 0) {
    const anyActive = await scope.evaluate(() => {
      return Array.from(document.querySelectorAll('.list-item-row')).some(el => {
        const c = (el.className || '').toLowerCase();
        return c.includes('selected') || c.includes('active') ||
          el.getAttribute('aria-selected') === 'true';
      });
    }).catch(() => false);
    if (!anyActive) {
      await listRows.first().scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
      await listRows.first().click({ timeout: 1500 }).catch(() => {});
      filled++;
      console.log(`      ✓ Clicked first .list-item-row`);
    }
  }

  const nothing = scope.locator('textarea[placeholder*="Nothing to add" i], textarea[aria-label*="Nothing to add" i]').first();
  if (await nothing.isVisible({ timeout: 500 }).catch(() => false)) {
    const cur = await nothing.inputValue().catch(() => '');
    if (!cur) {
      await nothing.click({ timeout: 1000 }).catch(() => {});
      await nothing.fill('Test').catch(() => {});
      filled++;
      console.log(`      ✓ Filled "Nothing to add" textarea`);
    }
  }

  return filled;
}

async function fillBasicDetails(scope, patient, credentials, { skip = null } = {}) {
  let filled = 0;
  for (const input of await scope.locator(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], input:not([type])'
  ).all()) {
    if (!(await input.isVisible().catch(() => false))) continue;
    if (!(await input.isEnabled().catch(() => false))) continue;

    const meta = await input.evaluate(el => ({
      name: el.name || '', id: el.id || '', placeholder: el.placeholder || '',
      type: el.type || '', label: el.labels?.[0]?.textContent?.trim() || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      value: el.value || '',
    })).catch(() => null);
    if (!meta) continue;
    if (meta.value && meta.value.trim()) continue;

    const hint = `${meta.name} ${meta.id} ${meta.placeholder} ${meta.label} ${meta.ariaLabel}`.toLowerCase();
    if (skip && skip.test(hint)) { console.log(`      • Skipped field (${hint.trim().slice(0, 50)})`); continue; }
    let value;
    if (meta.type === 'date') value = `${patient.dobYear}-${patient.dobMonth}-${patient.dobDay}`;
    else if (/first.*name|fname/.test(hint)) value = patient.firstName;
    else if (/last.*name|lname/.test(hint)) value = patient.lastName;
    else if (/email/.test(hint)) value = credentials.email;
    else if (/phone|mobile|cell/.test(hint)) value = patient.phone;
    else if (/zip|postal/.test(hint)) value = patient.zip;
    else if (/city/.test(hint)) value = patient.city;
    else if (/address|street/.test(hint)) value = patient.address;
    else if (/dob|birth|date/.test(hint)) value = patient.dob;
    else if (/weight/.test(hint)) value = patient.weight;
    else if (/height/.test(hint)) value = patient.height;
    else if (/age/.test(hint)) value = patient.age;
    else if (/state/.test(hint)) value = patient.state;
    else if (meta.type === 'number') value = '35';
    else if (meta.type === 'tel') value = patient.phone;
    else if (meta.type === 'email') value = credentials.email;
    else value = 'Test';

    await input.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await input.fill('').catch(() => {});
    await input.fill(value).catch(async () => {
      await input.type(value, { delay: 25 }).catch(() => {});
    });
    const now = await input.inputValue().catch(() => '');
    if (!now || !now.trim()) {
      await input.click({ timeout: 800 }).catch(() => {});
      await input.type(value, { delay: 25 }).catch(() => {});
    }
    filled++;
  }
  return filled;
}

async function fillCustomControls(scope, patient, credentials) {
  let filled = 0;

  for (const ce of await scope.locator('[contenteditable="true"]').all()) {
    if (!(await ce.isVisible().catch(() => false))) continue;
    const cur = (await ce.innerText().catch(() => '')).trim();
    if (cur) continue;
    await ce.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
    await ce.click({ timeout: 1500 }).catch(() => {});
    await ce.type('Test', { delay: 20 }).catch(() => {});
    filled++;
  }

  const combos = await scope.locator('[role="combobox"], [role="listbox"], [aria-haspopup="listbox"]').all();
  for (const cb of combos) {
    if (!(await cb.isVisible().catch(() => false))) continue;
    const tag = await cb.evaluate(el => el.tagName).catch(() => '');
    if (tag === 'SELECT') continue;
    const already = await cb.evaluate(el => {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      return t && !/select|choose|pick|--|^\s*$/.test(t) && t.length < 40;
    }).catch(() => false);
    if (already) continue;
    await cb.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
    await cb.click({ timeout: 1500 }).catch(() => {});
    await scope.page().waitForTimeout(300);
    const opts = await scope.page().locator(
      '[role="option"]:visible, [role="listbox"] li:visible, [role="menu"] [role="menuitem"]:visible, ul[class*="dropdown" i] li:visible'
    ).all();
    let picked = false;
    for (const opt of opts) {
      const t = (await opt.innerText().catch(() => '')).trim();
      if (!t || /select|choose|pick|--/i.test(t)) continue;
      await opt.click({ timeout: 1500 }).catch(() => {});
      picked = true;
      break;
    }
    if (picked) filled++;
    else await scope.page().keyboard.press('Escape').catch(() => {});
  }

  for (const inp of await scope.locator(
    'input[inputmode="numeric"], input[inputmode="tel"], input[inputmode="decimal"], input[data-mask], input[placeholder*="MM" i], input[placeholder*="DD" i], input[placeholder*="YYYY" i], input[placeholder*="(___)" i]'
  ).all()) {
    if (!(await inp.isVisible().catch(() => false))) continue;
    const cur = await inp.inputValue().catch(() => '');
    if (cur) continue;
    const meta = await inp.evaluate(el => ({
      placeholder: el.placeholder || '', ariaLabel: el.getAttribute('aria-label') || '',
      name: el.name || '', id: el.id || '', type: el.type || '',
    })).catch(() => ({}));
    const hint = `${meta.placeholder} ${meta.ariaLabel} ${meta.name} ${meta.id}`.toLowerCase();
    let value;
    if (/dob|birth|date|mm|dd|yyyy/.test(hint)) value = patient.dob;
    else if (/phone|tel|mobile|cell|\(___\)/.test(hint)) value = patient.phone;
    else if (/zip|postal/.test(hint)) value = patient.zip;
    else if (/weight/.test(hint)) value = patient.weight;
    else if (/height/.test(hint)) value = patient.height;
    else if (/age/.test(hint)) value = patient.age;
    else if (/ssn|social/.test(hint)) value = patient.ssnLast4;
    else value = patient.phone;
    await inp.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
    await inp.click({ timeout: 1500 }).catch(() => {});
    await inp.type(value, { delay: 40 }).catch(() => {});
    filled++;
  }

  return filled;
}

async function fillTextareas(scope) {
  let filled = 0;
  for (const ta of await scope.locator('textarea').all()) {
    if (!(await ta.isVisible().catch(() => false))) continue;
    const cur = await ta.inputValue().catch(() => '');
    if (cur) continue;
    await ta.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await ta.fill('None').catch(() => {});
    filled++;
  }
  return filled;
}

async function fillSelects(scope) {
  let filled = 0;
  for (const sel of await scope.locator('select').all()) {
    if (!(await sel.isVisible().catch(() => false))) continue;
    const opts = await sel.locator('option').all();
    if (opts.length <= 1) continue;
    const current = await sel.inputValue().catch(() => '');
    if (current) continue;
    for (let i = 1; i < opts.length; i++) {
      const v = await opts[i].getAttribute('value');
      const t = ((await opts[i].innerText().catch(() => '')) || '').trim();
      if (v && v !== '' && !/select|choose|--/i.test(t)) {
        await sel.selectOption(v).catch(() => {});
        filled++;
        break;
      }
    }
  }
  return filled;
}

async function checkConsentBoxes(scope) {
  let checked = 0;
  for (const cb of await scope.locator('input[type="checkbox"]').all()) {
    if (!(await cb.isVisible().catch(() => false))) continue;
    if (await cb.isChecked().catch(() => false)) continue;
    const meta = await cb.evaluate(el => ({
      name: el.name || '', id: el.id || '',
      label: el.labels?.[0]?.textContent?.trim() || '',
    })).catch(() => ({}));
    const hint = `${meta.name} ${meta.id} ${meta.label}`.toLowerCase();
    if (/agree|consent|terms|confirm|acknowledge|privacy|accept|sms|email/i.test(hint) ||
        !/newsletter|marketing|promo/i.test(hint)) {
      await cb.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
      await cb.check().catch(() => {});
      checked++;
    }
  }
  return checked;
}

async function deepBlockerReport(scope) {
  const report = await scope.evaluate(() => {
    const snip = (el) => (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 220);
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const out = {
      ariaInvalid: [], hiddenRequired: [], emptyRequiredInputs: [],
      emptyTextareas: [], uncheckedGroups: [],
      emptyCombos: [], emptyContentEditables: [], requiredLabels: [],
      widgetCensus: [],
    };

    document.querySelectorAll('input, select, textarea').forEach(el => {
      const style = window.getComputedStyle(el);
      const hidden = style.display === 'none' || style.visibility === 'hidden';
      const required = el.required || el.getAttribute('aria-required') === 'true';
      const empty = !el.value || el.value.trim() === '';
      const ariaInvalid = el.getAttribute('aria-invalid') === 'true';
      if (ariaInvalid) out.ariaInvalid.push({ type: el.type, name: el.name, id: el.id, html: snip(el) });
      if (hidden && required && empty) out.hiddenRequired.push({ type: el.type, name: el.name, id: el.id, html: snip(el) });
      if (el.tagName === 'TEXTAREA' && required && empty) out.emptyTextareas.push({ name: el.name, id: el.id, html: snip(el) });
      if (!hidden && required && empty && el.tagName !== 'TEXTAREA') {
        out.emptyRequiredInputs.push({ type: el.type, name: el.name, id: el.id, html: snip(el) });
      }
    });

    document.querySelectorAll('[aria-required="true"]').forEach(el => {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      const role = el.getAttribute('role') || '';
      const ariaInvalid = el.getAttribute('aria-invalid') === 'true';
      const hasValue = (el.innerText || '').trim().length > 0 ||
        el.querySelector('[aria-selected="true"], [aria-checked="true"], [aria-pressed="true"]');
      if (!hasValue || ariaInvalid) {
        out.ariaInvalid.push({ type: `non-native(${role})`, name: el.getAttribute('name') || '', id: el.id, html: snip(el) });
      }
    });

    document.querySelectorAll('[aria-invalid="true"]').forEach(el => {
      out.ariaInvalid.push({
        type: `aria-invalid(${el.getAttribute('role') || el.tagName.toLowerCase()})`,
        name: el.getAttribute('name') || '', id: el.id, html: snip(el),
      });
    });

    document.querySelectorAll('[role="radiogroup"]').forEach(g => {
      const checked = g.querySelector('[role="radio"][aria-checked="true"]');
      if (!checked) out.uncheckedGroups.push({ id: g.id, label: g.textContent?.trim().slice(0, 60), html: snip(g) });
    });

    ['.custom-radio-circle', '.custom-checkbox'].forEach(cls => {
      const groups = new Set();
      document.querySelectorAll(cls).forEach(el => {
        if (el.parentElement) groups.add(el.parentElement);
      });
      groups.forEach(g => {
        const kids = Array.from(g.querySelectorAll(cls));
        const anyOn = kids.some(c => {
          const cc = (c.className || '').toLowerCase();
          const p = c.closest('[class*="option-card" i]');
          const pc = p ? (p.className || '').toLowerCase() : '';
          return cc.includes('selected') || cc.includes('active') || cc.includes('checked') ||
            pc.includes('selected') || pc.includes('active') || pc.includes('checked') ||
            c.getAttribute('aria-checked') === 'true' ||
            c.getAttribute('data-checked') === 'true';
        });
        if (!anyOn && kids.length) {
          out.uncheckedGroups.push({ id: g.id, label: g.textContent?.trim().slice(0, 60), html: snip(g) });
        }
      });
    });

    const parents = new Set();
    document.querySelectorAll('[aria-pressed], [data-selected], [role="option"]').forEach(el => {
      if (el.parentElement) parents.add(el.parentElement);
    });
    parents.forEach(g => {
      const children = Array.from(g.querySelectorAll('[aria-pressed], [data-selected], [role="option"]'));
      if (!children.length) return;
      const anySelected = children.some(c =>
        c.getAttribute('aria-pressed') === 'true' ||
        c.getAttribute('data-selected') === 'true' ||
        c.getAttribute('aria-selected') === 'true'
      );
      if (!anySelected) out.uncheckedGroups.push({ id: g.id, label: g.textContent?.trim().slice(0, 60), html: snip(g) });
    });

    document.querySelectorAll('[role="combobox"], [role="listbox"]').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      const hasSelection = el.querySelector('[aria-selected="true"]') ||
        (txt && !/select|choose|pick|--/.test(txt) && txt.length < 40);
      if (!hasSelection) out.emptyCombos.push({ id: el.id, html: snip(el) });
    });

    document.querySelectorAll('[contenteditable="true"]').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (!(el.innerText || '').trim()) out.emptyContentEditables.push({ id: el.id, html: snip(el) });
    });

    document.querySelectorAll('label').forEach(l => {
      const txt = (l.innerText || '').trim();
      if (!/\*\s*$/.test(txt) && !/\*\s*$/.test(txt.replace(/\s+/g, ' '))) return;
      const forId = l.getAttribute('for');
      let ctrl = forId ? document.getElementById(forId) : l.querySelector('input, select, textarea, [role="combobox"], [contenteditable="true"]');
      if (!ctrl) {
        const parent = l.parentElement;
        if (parent) ctrl = parent.querySelector('input, select, textarea, [role="combobox"], [contenteditable="true"]');
      }
      if (!ctrl) { out.requiredLabels.push({ label: txt.slice(0, 60), html: snip(l) }); return; }
      const empty = ctrl.matches('input, select, textarea')
        ? !ctrl.value
        : !(ctrl.innerText || '').trim() && !ctrl.querySelector('[aria-selected="true"], [aria-checked="true"], [aria-pressed="true"]');
      if (empty) out.requiredLabels.push({ label: txt.slice(0, 60), html: snip(l) });
    });

    const seen = new Set();
    document.querySelectorAll('[class]').forEach(el => {
      if (!isVisible(el)) return;
      const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
      if (!/radio|option|choice|answer|select|check/.test(cls)) return;
      const tag = el.tagName.toLowerCase();
      const label = (el.innerText || '').trim().slice(0, 50);
      const key = `${tag}.${cls}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.widgetCensus.push({ tag, cls: cls.slice(0, 120), sample: label, html: snip(el) });
    });

    return out;
  }).catch(() => ({}));

  const printers = [
    ['aria-invalid / non-native required', 'ariaInvalid'],
    ['hidden required fields', 'hiddenRequired'],
    ['visible required inputs still empty', 'emptyRequiredInputs'],
    ['empty required textareas', 'emptyTextareas'],
    ['option groups with no active selection', 'uncheckedGroups'],
    ['empty combobox/listbox controls', 'emptyCombos'],
    ['empty contenteditable elements', 'emptyContentEditables'],
    ['labels marked required (*) with empty controls', 'requiredLabels'],
    ['widget census (visible elements with radio/option/choice/answer/select/check classes)', 'widgetCensus'],
  ];
  for (const [title, key] of printers) {
    const arr = report[key];
    if (!arr?.length) continue;
    console.warn(`   ⚠ ${title}:`);
    arr.forEach(f => {
      const head = f.label || f.sample || f.name || f.type || f.tag || f.id || '';
      const id = f.id ? ` id="${f.id}"` : '';
      const cls = f.cls ? ` class="${f.cls}"` : '';
      console.warn(`      • ${head}${id}${cls}\n        ${f.html}`);
    });
  }
  return report;
}

async function waitForAdvanceEnabled(page, scope, timeoutMs = 4000) {
  const selectors = [
    'button:has-text("Continue to see if you qualify")',
    'button:has-text("Continue")',
    'button:has-text("Save & Continue")',
    'button:has-text("Save")',
    'button:has-text("Next")',
    'button:has-text("Proceed")',
    'button:has-text("Apply")',
    'button:has-text("OK")',
    'button:has-text("Done")',
    'button:has-text("Finish")',
    'button:has-text("Submit")',
    'button:has-text("Review")',
    'button:has-text("Checkout")',
    'button:has-text("Complete Checkout")',
    'button:has-text("Pay")',
    'button:has-text("Begin")',
    'button:has-text("Agree")',
    'button:has-text("Accept")',
    'button:has-text("I understand")',
    'button:has-text("Pre-Approval")',
    'button[type="submit"]',
  ];
  const scopes = [scope, page];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const s of scopes) {
      for (const sel of selectors) {
        const loc = s.locator(sel).filter({ visible: true });
        const n = await loc.count().catch(() => 0);
        if (!n) continue;
        for (let i = n - 1; i >= 0; i--) {
          const el = loc.nth(i);
          if (!(await el.isVisible({ timeout: 200 }).catch(() => false))) continue;
          if (!(await el.isEnabled().catch(() => false))) continue;
          return el;
        }
      }
    }
    await page.waitForTimeout(300);
  }
  return null;
}

async function forceClickAnyAdvance(page, scope) {
  const selectors = [
    'button:has-text("Continue to see if you qualify")',
    'button:has-text("Continue")', 'button:has-text("Next")',
    'button:has-text("Save")', 'button:has-text("Submit")',
    'button:has-text("Proceed")', 'button[type="submit"]',
  ];
  for (const s of [scope, page]) {
    for (const sel of selectors) {
      const loc = s.locator(sel).filter({ visible: true });
      const n = await loc.count().catch(() => 0);
      for (let i = n - 1; i >= 0; i--) {
        const el = loc.nth(i);
        if (!(await el.isVisible({ timeout: 200 }).catch(() => false))) continue;
        if (!(await el.isEnabled().catch(() => false))) continue;
        await el.click({ timeout: 2000, force: true }).catch(() => {});
        return true;
      }
    }
  }
  return false;
}

/**
 * v14 FIX B2 — fill the signup form (first/last/email/phone/state + consent).
 * v20: records the email that was actually typed (RUN.email).
 */
async function fillSignupForm(page, patient, credentials) {
  console.log(`      → Filling signup form...`);

  const tryFill = async (selector, value, { masked = false } = {}) => {
    const el = page.locator(selector).first();
    if (!(await el.isVisible({ timeout: 800 }).catch(() => false))) return false;
    const cur = await el.inputValue().catch(() => '');
    if (cur && cur.trim()) return false;
    await el.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
    await el.click({ timeout: 1000 }).catch(() => {});
    await el.fill('').catch(() => {});
    if (masked) {
      await el.type(value, { delay: 30 }).catch(() => {});
    } else {
      await el.fill(value).catch(async () => {
        await el.type(value, { delay: 20 }).catch(() => {});
      });
    }
    let now = await el.inputValue().catch(() => '');
    if (!now || !now.trim()) {
      await el.click({ timeout: 800 }).catch(() => {});
      await el.type(value, { delay: 25 }).catch(() => {});
      now = await el.inputValue().catch(() => '');
    }
    return now && now.trim().length > 0;
  };

  let touched = 0;
  if (await tryFill('input[name="first_name"], input[placeholder*="First Name" i], input[name*="first" i], input[aria-label*="First Name" i], input[id*="first" i]', patient.firstName)) touched++;
  if (await tryFill('input[name="last_name"],  input[placeholder*="Last Name" i],  input[name*="last" i],  input[aria-label*="Last Name" i],  input[id*="last" i]',  patient.lastName))  touched++;
  if (await tryFill('input[type="email"], input[name*="email" i], input[placeholder*="Email" i], input[id*="email" i]', credentials.email)) touched++;
  if (await tryFill('input[name="phone"], input[type="tel"], input[placeholder*="Phone" i], input[id*="phone" i]', patient.phone, { masked: true })) touched++;

  const stateSel = page.locator('select[name="state"], select[name*="state" i], select[id*="state" i]').first();
  if (await stateSel.isVisible({ timeout: 500 }).catch(() => false)) {
    try {
      const cur = await stateSel.inputValue().catch(() => '');
      if (!cur) await stateSel.selectOption(patient.state);
      const v = await stateSel.inputValue().catch(() => '');
      if (v) touched++;
    } catch {}
  }

  for (const cb of await page.locator('input[type="checkbox"]').all()) {
    if (!(await cb.isVisible().catch(() => false))) continue;
    if (await cb.isChecked().catch(() => false)) continue;
    await cb.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
    await cb.check().catch(() => {});
    touched++;
  }

  console.log(`      ✓ Signup form touched ${touched} field(s)`);

  const stillEmpty = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[required], select[required]').forEach(el => {
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      if (!el.value || !el.value.trim()) out.push(el.name || el.id || el.type);
    });
    return out;
  });
  if (stillEmpty.length) {
    console.warn(`      ⚠ Required fields still empty after fill: ${stillEmpty.join(', ')}`);
    for (const name of stillEmpty) {
      const el = page.locator(`[name="${name}"], #${name}`).first();
      if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) continue;
      const tag = await el.evaluate(e => e.tagName).catch(() => '');
      if (tag === 'SELECT') {
        await el.selectOption(patient.state).catch(() => {});
      } else if (/email/i.test(name)) {
        await el.fill('').catch(() => {});
        await el.fill(credentials.email).catch(async () => { await el.type(credentials.email, { delay: 20 }).catch(() => {}); });
      } else if (/first/i.test(name)) {
        await el.fill('').catch(() => {});
        await el.fill(patient.firstName).catch(async () => { await el.type(patient.firstName, { delay: 20 }).catch(() => {}); });
      } else if (/last/i.test(name)) {
        await el.fill('').catch(() => {});
        await el.fill(patient.lastName).catch(async () => { await el.type(patient.lastName, { delay: 20 }).catch(() => {}); });
      } else if (/phone/i.test(name)) {
        await el.click().catch(() => {});
        await el.type(patient.phone, { delay: 30 }).catch(() => {});
      }
    }
    const stillEmpty2 = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[required], select[required]').forEach(el => {
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return;
        if (!el.value || !el.value.trim()) out.push(el.name || el.id || el.type);
      });
      return out;
    });
    if (stillEmpty2.length) console.warn(`      ⚠ Still empty after retry: ${stillEmpty2.join(', ')}`);
    else console.log(`      ✓ All required fields now populated`);
  } else {
    console.log(`      ✓ All required fields verified populated`);
  }

  // v20: remember the email that is really in the form
  const typedEmail = await page
    .locator('input[type="email"], input[name*="email" i], input[id*="email" i]')
    .filter({ visible: true }).first().inputValue().catch(() => '');
  if (typedEmail && typedEmail.trim()) {
    RUN.email = typedEmail.trim();
    console.log(`      📧 Signup email in use: ${RUN.email}`);
  }

  await dismissOverlays(page);

  const submit = page.locator('button:has-text("Submit"), button[type="submit"]').filter({ visible: true }).first();
  if (await submit.isVisible({ timeout: 1500 }).catch(() => false)) {
    await submit.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
    await submit.click({ timeout: 3000 }).catch(() => {});
    console.log(`      ✓ Clicked signup Submit`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    return true;
  }
  return false;
}

/**
 * v20 FIX H1 — robust signup-form detection (Playwright locators, not a
 * one-shot DOM snapshot) and a handler that may run several times.
 */
async function isSignupFormVisible(page) {
  const vis = (sel) => page.locator(sel).filter({ visible: true }).first()
    .isVisible({ timeout: 400 }).catch(() => false);
  const [hasFirst, hasLast, hasEmail] = await Promise.all([
    vis('input[name*="first" i], input[id*="first" i], input[placeholder*="first name" i]'),
    vis('input[name*="last" i], input[id*="last" i], input[placeholder*="last name" i]'),
    vis('input[type="email"], input[name*="email" i], input[placeholder*="email" i], input[id*="email" i]'),
  ]);
  return hasFirst && hasLast && hasEmail;
}

async function signupHasEmptyFields(page) {
  return await page.evaluate(() => {
    const isVis = (el) => {
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const els = Array.from(document.querySelectorAll(
      'input[name*="first" i], input[name*="last" i], input[type="email"], input[name*="email" i], ' +
      'input[name="phone"], input[type="tel"], select[name*="state" i], select[id*="state" i]'
    )).filter(isVis);
    return els.some(el => !el.value || !el.value.trim());
  }).catch(() => false);
}

/** Returns true if it filled/submitted the signup form on this call. */
async function handleSignupIfPresent(page, patient, credentials, state) {
  if (state.attempts >= 5) return false;
  if (!(await isSignupFormVisible(page))) return false;
  const empty = await signupHasEmptyFields(page);
  if (state.attempts > 0 && !empty) return false; // already filled & submitted, nothing new to do
  state.attempts++;
  console.log(`   ✓ Signup form detected (attempt ${state.attempts}) — filling it`);
  await fillSignupForm(page, patient, credentials);
  return true;
}

/**
 * v16 FIX D1 — detect the combined plan / delivery address / card page.
 */
async function isPlanCheckoutPage(page) {
  if (/personalize-plan/i.test(page.url())) return true;
  return await page.getByRole('textbox', { name: 'Credit Card Number' })
    .isVisible({ timeout: 500 }).catch(() => false);
}

async function fillVerified(locator, value) {
  const strip = s => (s || '').replace(/[^a-z0-9]/gi, '');
  await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  await locator.click();
  await locator.fill(value);
  let now = await locator.inputValue().catch(() => '');
  if (strip(now) !== strip(value)) {
    await locator.fill('');
    await locator.pressSequentially(value, { delay: 40 });
    now = await locator.inputValue().catch(() => '');
  }
  if (strip(now) !== strip(value)) {
    throw new Error(`Field did not accept value. Wanted "${value}", got "${now}"`);
  }
}

async function selectPlan(page) {
  const candidates = [
    { name: 'Monthly Plan (4 Week Supply)', loc: () => page.getByText(/Monthly Plan\s+4 Week Supply/i) },
    { name: 'Monthly Plan',                 loc: () => page.getByText(/Monthly Plan/i) },
    { name: '3-month plan',                 loc: () => page.getByText(/3[\s-]*Month|Quarterly|12[\s-]*Week/i) },
    { name: 'plan card (monthly)',          loc: () => page.locator('[class*="plan" i]').filter({ hasText: /month|4 week/i }) },
    { name: 'plan card (any)',              loc: () => page.locator('[class*="plan-col" i], [class*="plan-card" i], [class*="plan-box" i]') },
  ];

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const c of candidates) {
      const visible = c.loc().filter({ visible: true });
      const n = await visible.count().catch(() => 0);
      if (!n) continue;

      const target = n > 1 ? visible.nth(1) : visible.first();
      await target.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
      const ok = await target.click({ timeout: 3000 }).then(() => true)
        .catch(() => target.click({ timeout: 3000, force: true }).then(() => true).catch(() => false));
      if (ok) {
        await page.waitForTimeout(500);
        console.log(`   ✓ Selected plan: ${c.name} (visible matches=${n})`);
        return c.name;
      }
    }
    await page.waitForTimeout(500);
  }

  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="plan" i]'))
      .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60))
      .filter(Boolean).slice(0, 10)
  ).catch(() => []);
  console.warn(`   ⚠ Plan-like elements found: ${JSON.stringify(labels)}`);
  throw new Error('No visible plan option found (Monthly or 3-month). See checkout-fill-failed.html.');
}

/* =====================================================================
 * v21 FIX I1 — DELIVERY ADDRESS (Google-style autocomplete) THAT ACTUALLY
 *              GETS SELECTED, ON ANY CHECKOUT PAGE
 * ===================================================================== */

/** The visible delivery/shipping/street address input (not email). */
function addressInput(page) {
  return page
    .getByRole('textbox', { name: /delivery address|shipping address|street address/i })
    .or(page.locator(
      'input[placeholder*="delivery address" i], input[placeholder*="shipping address" i], ' +
      'input[placeholder*="street address" i], input[placeholder*="address" i]:not([placeholder*="email" i]), ' +
      'input[name*="address" i]:not([name*="email" i]), input[id*="address" i]:not([id*="email" i]), ' +
      'input[aria-label*="address" i]:not([aria-label*="email" i])'
    ))
    .filter({ visible: true })
    .first();
}

/** Any visible autocomplete suggestion (Google .pac-item, listbox options, custom <li> lists). */
function addressSuggestions(page) {
  return page.locator('.pac-container .pac-item, .pac-item')
    .or(page.locator('[role="listbox"] [role="option"]'))
    .or(page.locator(
      'ul[class*="suggest" i] li, ul[class*="autocomplete" i] li, li[class*="suggest" i], li[class*="autocomplete" i], ' +
      '[class*="suggestion" i][role="button"], [class*="predictions" i] li'
    ))
    .or(page.getByRole('option'))
    .or(page.getByRole('button', { name: /6202 E Test Dr|Mesa, AZ/i }))
    .filter({ visible: true });
}

/** Has the address input been turned into a full, selected address? */
async function addressLooksSelected(addr, query) {
  const v = ((await addr.inputValue().catch(() => '')) || '').trim();
  if (!v) return false;
  if (v.toLowerCase() === String(query).trim().toLowerCase()) return false; // still what we typed
  return v.length > String(query).length + 3 || /,/.test(v);
}

/** Click "Use this address" / "Confirm address" style prompts, if any. */
async function confirmAddressPrompts(page) {
  const btn = page
    .locator('button:visible, [role="button"]:visible, a:visible')
    .filter({ hasText: /use (this |the )?(suggested |recommended |entered |verified )?address|confirm (my )?address|keep (this |original |entered )address|address is correct|yes,? (it'?s |that'?s )?correct/i })
    .first();
  if (await btn.isVisible({ timeout: 700 }).catch(() => false)) {
    const t = ((await btn.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    await btn.click({ timeout: 2500 }).catch(() => btn.click({ timeout: 2500, force: true }).catch(() => {}));
    console.log(`   ✓ Address confirmation prompt clicked: "${t}"`);
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

/** Last resort: type the address in the plain fields (street / city / state / zip). */
async function fillAddressManually(page, patient, addr) {
  await addr.click({ timeout: 2000 }).catch(() => {});
  await addr.fill('').catch(() => {});
  await addr.fill(patient.address).catch(() => {});
  await addr.press('Tab').catch(() => {});
  const tryFillField = async (sel, value) => {
    const el = page.locator(sel).filter({ visible: true }).first();
    if (!(await el.isVisible({ timeout: 400 }).catch(() => false))) return false;
    const cur = await el.inputValue().catch(() => '');
    if (cur && cur.trim()) return false;
    await el.fill(value).catch(() => {});
    return true;
  };
  await tryFillField('input[name*="city" i], input[id*="city" i], input[placeholder*="city" i]', patient.city);
  await tryFillField('input[name*="zip" i], input[id*="zip" i], input[placeholder*="zip" i], input[name*="postal" i]', patient.zip);
  const st = page.locator('select[name*="state" i], select[id*="state" i]').filter({ visible: true }).first();
  if (await st.isVisible({ timeout: 400 }).catch(() => false)) {
    const cur = await st.inputValue().catch(() => '');
    if (!cur) await st.selectOption(patient.state).catch(() => {});
  } else {
    await tryFillField('input[name*="state" i], input[id*="state" i], input[placeholder*="state" i]', patient.state);
  }
}

/**
 * Type the address SLOWLY (so the autocomplete really fires), wait for the
 * suggestion list, click the first suggestion and VERIFY the field changed.
 * Retries with fallback queries, then falls back to manual entry.
 * Returns { ok, method, query }.
 */
async function selectDeliveryAddress(page, cfg) {
  const { payment, patient } = cfg;
  const queries = [payment.addressQuery, ...(payment.addressFallbacks || [])];

  const addr = addressInput(page);
  const present = await addr.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  if (!present) {
    console.warn('   ⚠ Delivery address input not visible');
    return { ok: false, method: 'none', query: null };
  }

  for (let attempt = 0; attempt < queries.length; attempt++) {
    const q = queries[attempt];
    await addr.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    await addr.click({ timeout: 3000 }).catch(() => {});
    await addr.fill('').catch(() => {});
    // real key events — fill() alone often does not trigger Google Autocomplete
    await addr.pressSequentially(q, { delay: 120 }).catch(() => {});
    console.log(`   • Address attempt ${attempt + 1}: typed "${q}"`);

    const sugg = addressSuggestions(page).first();
    const haveList = await sugg.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);

    let method = 'keyboard';
    if (haveList) {
      const text = ((await sugg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const ok = await sugg.click({ timeout: 3000 }).then(() => true)
        .catch(() => sugg.click({ timeout: 3000, force: true }).then(() => true).catch(() => false));
      method = 'suggestion';
      console.log(`   ✓ Picked address suggestion "${text}"${ok ? '' : ' (click failed, trying keyboard)'}`);
      if (!ok) {
        await addr.press('ArrowDown').catch(() => {});
        await page.waitForTimeout(250);
        await addr.press('Enter').catch(() => {});
        method = 'keyboard';
      }
    } else {
      // no visible list — try the keyboard route, which works for Google's widget
      await addr.press('ArrowDown').catch(() => {});
      await page.waitForTimeout(400);
      await addr.press('Enter').catch(() => {});
      console.log('   ⚠ No suggestion list visible — used ArrowDown+Enter');
    }

    await page.waitForTimeout(900);
    if (await addressLooksSelected(addr, q)) {
      const v = await addr.inputValue().catch(() => '');
      console.log(`   ✓ Delivery address selected via ${method}: "${v}"`);
      await confirmAddressPrompts(page);
      return { ok: true, method, query: q };
    }
    console.warn(`   ⚠ Address field still "${await addr.inputValue().catch(() => '')}" after attempt ${attempt + 1}`);
    await page.keyboard.press('Escape').catch(() => {});
  }

  console.warn('   ⚠ Autocomplete never produced a selectable address — filling manually');
  await fillAddressManually(page, patient, addr);
  const v = await addr.inputValue().catch(() => '');
  await snapshot(page, 'address-manual-fallback');
  return { ok: !!(v && v.trim()), method: 'manual', query: null };
}

/** Fill the card block if its fields are on screen and empty. */
async function fillCardIfPresent(page, payment) {
  const fields = [
    ['Name on Card', payment.cardName],
    ['Credit Card Number', payment.cardNumber],
    ['Expiry Date', payment.expiry],
    ['CVV', payment.cvv],
  ];
  let n = 0;
  for (const [name, value] of fields) {
    const loc = page.getByRole('textbox', { name }).first();
    if (!(await loc.isVisible({ timeout: 400 }).catch(() => false))) continue;
    const cur = await loc.inputValue().catch(() => '');
    if (cur && cur.trim()) continue;
    try { await fillVerified(loc, value); n++; }
    catch (e) { console.warn(`      ⚠ Card field "${name}": ${e.message.split('\n')[0]}`); }
  }
  if (n) console.log(`      ✓ Filled ${n} card field(s)`);
  return n;
}

/* =====================================================================
 * v21 FIX I2 — THE SECOND CHECKOUT PAGE (/nd-in-approved-secure-checkout)
 * ===================================================================== */

async function isApprovedCheckoutPage(page) {
  if (/approved|secure-checkout/i.test(page.url())) return true;
  return await page.getByText(/your treatment details/i).filter({ visible: true }).first()
    .isVisible({ timeout: 500 }).catch(() => false);
}

/** Strict "order really placed" check (used inside the approved-checkout loop). */
function looksOrderPlaced(url, body) {
  if (/thank|success|order-received|receipt|order-confirm|confirmation/i.test(url)) return true;
  return /thank you for your order|order (has been )?(placed|confirmed|received|submitted)|order\s*(#|number|id)\s*:?\s*[A-Z0-9]{4,}|you'?re all set|verification (complete|submitted)/i.test(body);
}

/** Print every visible input/select/textarea/button — gold for debugging a stuck page. */
async function logVisibleControls(page, label) {
  const info = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const st = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const inputs = Array.from(document.querySelectorAll('input,select,textarea')).filter(vis).map(e =>
      `${e.tagName.toLowerCase()}[${e.type || ''}] name="${e.name || ''}" id="${e.id || ''}" ` +
      `ph="${e.placeholder || ''}" aria="${e.getAttribute('aria-label') || ''}" value="${(e.value || '').slice(0, 30)}"`);
    const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="submit"]')).filter(vis).map(e =>
      `${(e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 40)}${e.disabled ? ' (disabled)' : ''}`).filter(Boolean);
    return { inputs: inputs.slice(0, 25), buttons: buttons.slice(0, 25) };
  }).catch(() => ({ inputs: [], buttons: [] }));
  console.log(`      🔎 ${label} — visible inputs:`);
  info.inputs.forEach(i => console.log(`         • ${i}`));
  console.log(`      🔎 ${label} — visible buttons: ${info.buttons.join(' | ')}`);
  LAST_CONTROLS = info;
  return info;
}

/** The final "pay / place order" style button, if enabled. */
async function findFinalPayButton(page) {
  const names = [
    /^complete checkout$/i, /complete checkout/i, /place order/i, /complete order/i,
    /submit order/i, /^pay\b/i, /pay now/i, /^confirm\b/i,
  ];
  for (const re of names) {
    const loc = page.locator('button:visible, [role="button"]:visible, input[type="submit"]:visible')
      .filter({ hasText: re });
    const n = await loc.count().catch(() => 0);
    for (let i = n - 1; i >= 0; i--) {
      const el = loc.nth(i);
      if (await el.isEnabled().catch(() => false)) return el;
    }
  }
  return null;
}

/** v23 K3 — visible validation / error messages on the page. */
async function collectValidationErrors(page) {
  return await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const st = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const sels = '[role="alert"], [class*="error" i], [class*="invalid" i], [class*="danger" i], ' +
      '[class*="help-block" i], [class*="warning" i], [aria-invalid="true"]';
    const out = [];
    document.querySelectorAll(sels).forEach(el => {
      if (!vis(el)) return;
      const t = ((el.innerText || el.getAttribute('name') || el.id || '') + '').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (t && !out.includes(t)) out.push(t);
    });
    return out.slice(0, 8);
  }).catch(() => []);
}
async function logValidationErrors(page) {
  const errs = await collectValidationErrors(page);
  console.warn(errs.length
    ? `      ⚠ Visible validation/error text: ${errs.map(e => `"${e}"`).join(' | ')}`
    : '      • No visible validation/error text');
  return errs;
}

/**
 * v23 K1 — pick a dosage option in the "Dosage Tailored To Your Treatment Plan"
 * section of the approved-checkout page (the final button stays disabled /
 * inert until one is chosen). Returns the clicked label, 'already-selected' or null.
 */
async function selectDosageIfPresent(page) {
  const heading = page.getByText(/dosage/i).filter({ visible: true }).first();
  if (!(await heading.isVisible({ timeout: 500 }).catch(() => false))) return null;

  const picked = await heading.evaluate((h) => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const st = window.getComputedStyle(el);
      return r.width > 5 && r.height > 5 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const clsOf = (el) => (el && typeof el.className === 'string' ? el.className.toLowerCase() : '');
    const isSel = (el) => {
      const near = el.closest('[class*="option" i], [class*="card" i], [class*="dose" i], label');
      return el.checked === true ||
        ['aria-checked', 'aria-pressed', 'aria-selected', 'data-selected', 'data-checked']
          .some(a => el.getAttribute(a) === 'true') ||
        /(^|[\s_-])(selected|active|checked)/.test(clsOf(el)) ||
        /(^|[\s_-])(selected|active|checked)/.test(clsOf(near));
    };
    const bad = /continue|checkout|submit|cancel|back|next|apply|pay|learn more|details/i;
    const doseRe = /\d+(\.\d+)?\s*(mg|mcg|ml|units?|iu)\b/i;

    let sec = h;
    for (let depth = 0; depth < 6 && sec; depth++, sec = sec.parentElement) {
      const raw = Array.from(sec.querySelectorAll(
        'input[type="radio"], [role="radio"], [role="option"], .option-card, .custom-radio-circle, ' +
        '[class*="dose" i], [class*="dosage" i], [class*="option" i], label, button'));
      const targets = [];
      for (const el of raw) {
        const t = el.tagName === 'INPUT' ? (el.closest('label') || el.parentElement) : el;
        if (!t || targets.some(x => x.t === t)) continue;
        if (t.contains(h) || h.contains(t) || !vis(t)) continue;
        const txt = (t.innerText || '').replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 120 || bad.test(txt)) continue;
        targets.push({ t, el, txt });
      }
      if (!targets.length) continue;
      if (targets.some(x => isSel(x.el) || isSel(x.t))) return 'already-selected';
      const pick = targets.find(x => doseRe.test(x.txt)) || targets[0];
      pick.t.scrollIntoView({ block: 'center' });
      pick.t.click();
      return pick.txt.slice(0, 60);
    }
    return null;
  }).catch(() => null);

  if (picked) {
    console.log(`      ✓ Dosage: ${picked === 'already-selected' ? 'already selected' : `clicked "${picked}"`}`);
    if (picked !== 'already-selected') await page.waitForTimeout(500);
  } else {
    console.warn('      ⚠ Dosage section found but no selectable option detected');
  }
  return picked;
}

/**
 * Drives the page that follows the first checkout submit: choose the delivery
 * address (autocomplete), fill card fields if shown, pick dosage/answers, tick
 * consents and press the final button — until the order is placed, a verification
 * wizard appears, or the Cancel Treatment control shows up.
 * Returns { advanced, done, handoff }.
 */
async function completeApprovedCheckout(page, cfg) {
  const MAX = 10;
  let idle = 0;
  const out = { advanced: false, done: false, handoff: null };

  for (let step = 1; step <= MAX; step++) {
    await waitForPageSettled(page, { timeout: 6000 });
    const urlBefore = page.url();
    const bodyBefore = await bodySnippet(page);
    const fullBody = await page.locator('body').innerText().catch(() => '');
    console.log(`   → Approved-checkout sub-step ${step}: ${urlBefore}`);

    if (looksOrderPlaced(urlBefore, fullBody)) {
      console.log('      ✓ Order-placed signal detected');
      out.done = true;
      return out;
    }
    if (/complete-verification|verify|identity/i.test(urlBefore) ||
        await page.locator('text=/Verify Your Identity/i').first().isVisible({ timeout: 400 }).catch(() => false)) {
      console.log('      ✓ Verification wizard reached');
      out.handoff = 'verification';
      return out;
    }
    if ((await cancelTriggers(page).count().catch(() => 0)) > 0) {
      console.log('      ✓ "Cancel Treatment" control is visible — order is placed');
      out.done = true;
      return out;
    }

    await snapshot(page, `approved-checkout-${step}`);
    if (step === 1 || idle > 0) await logVisibleControls(page, `approved-checkout ${step}`);

    const scope = await findInteractiveRoot(page);

    // 1) delivery address first (so generic fillers don't overwrite it)
    const addr = addressInput(page);
    if (await addr.isVisible({ timeout: 600 }).catch(() => false)) {
      const cur = ((await addr.inputValue().catch(() => '')) || '').trim();
      if (!cur || cur.length <= (cfg.payment.addressQuery || '').length + 3) {
        const r = await selectDeliveryAddress(page, cfg);
        console.log(`      • Address result: ${JSON.stringify(r)}`);
      }
    }
    await confirmAddressPrompts(page);

    // 2) card, generic fields, consents, questions
    await selectDosageIfPresent(page);
    await fillCardIfPresent(page, cfg.payment);
    await fillBasicDetails(scope, cfg.patient, cfg.credentials, { skip: /promo|coupon|discount|voucher|referral|gift/i });
    await fillSelects(scope);
    await fillTextareas(scope);
    await checkConsentBoxes(scope);
    const answered = await answerBySemantics(page, scope);
    if (!answered) await forceClickUnselectedWidgets(page, scope);
    await dismissOverlays(page);

    // 3) press the final button (or any enabled advance)
    let btn = await findFinalPayButton(page);
    if (!btn) btn = await waitForAdvanceEnabled(page, scope, 4000);
    if (!btn) {
      idle++;
      console.warn(`      ⚠ No enabled advance button (idle ${idle})`);
      await logValidationErrors(page);
      await deepBlockerReport(scope);
      await dumpDom(page, `approved-checkout-${step}-blocked`);
      if (idle >= 3) break;
      continue;
    }

    const txt = ((await btn.innerText().catch(() => '')) || (await btn.getAttribute('value').catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    await btn.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await btn.click({ timeout: 3000 }).catch(() => btn.click({ timeout: 3000, force: true }).catch(() => {}));
    console.log(`      ✓ Clicked: "${txt}"`);

    let progressed = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      await page.waitForTimeout(300);
      if (page.url() !== urlBefore || (await bodySnippet(page)) !== bodyBefore) { progressed = true; break; }
    }
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    if (progressed) { out.advanced = true; idle = 0; }
    else {
      idle++;
      console.warn(`      ⚠ No visible progress after "${txt}" (idle ${idle})`);
      await logValidationErrors(page);
      await dumpDom(page, `approved-checkout-${step}-noprogress`);
      if (idle >= 3) break;
    }
  }
  console.warn(`      ⚠ Approved-checkout gave up: ${JSON.stringify(out)} at ${page.url()}`);
  await logVisibleControls(page, 'approved-checkout gave up');
  await snapshot(page, 'approved-checkout-gave-up');
  await dumpDom(page, 'approved-checkout-gave-up');
  return out;
}

async function completePlanCheckout(page, cfg) {
  const { payment } = cfg;

  await selectPlan(page);

  // v21 FIX I1 — robust delivery-address selection (see selectDeliveryAddress)
  const addrResult = await selectDeliveryAddress(page, cfg);
  if (!addrResult.ok) console.warn('   ⚠ Delivery address could not be confirmed — continuing anyway');
  await confirmAddressPrompts(page);

  await fillVerified(page.getByRole('textbox', { name: 'Name on Card' }), payment.cardName);
  await fillVerified(page.getByRole('textbox', { name: 'Credit Card Number' }), payment.cardNumber);
  await fillVerified(page.getByRole('textbox', { name: 'Expiry Date' }), payment.expiry);
  await fillVerified(page.getByRole('textbox', { name: 'CVV' }), payment.cvv);
  console.log('   ✓ Filled card details');
}

/* =====================================================================
 * v17 FIX E1 — IDENTITY VERIFICATION WITH IMAGE UPLOADS
 * ===================================================================== */

/**
 * Returns { idFront, idBack, selfie } absolute file paths.
 * Uses env-provided files when they exist; otherwise draws placeholder
 * PNGs in a throw-away browser page (no network required).
 */
async function generateTestImages(context, uploads, patient) {
  const out = {};
  const want = [
    ['idFront', uploads.idFront, 'id-front.png'],
    ['idBack',  uploads.idBack,  'id-back.png'],
    ['selfie',  uploads.selfie,  'selfie.png'],
  ];

  const needsGen = want.some(([, p]) => !(p && fs.existsSync(p)));
  let tmp = null;
  if (needsGen) {
    tmp = await context.newPage();
    await tmp.setViewportSize({ width: 800, height: 520 });
  }

  for (const [key, envPath, fileName] of want) {
    if (envPath && fs.existsSync(envPath)) {
      out[key] = path.resolve(envPath);
      console.log(`   • ${key}: using provided file ${out[key]}`);
      continue;
    }
    const target = path.resolve(path.join(FIXTURES_DIR, fileName));
    let html;
    if (key === 'selfie') {
      html = `<body style="margin:0;background:#cfe3f5;display:flex;align-items:center;justify-content:center;height:520px;">
        <div style="position:relative;width:260px;height:340px;">
          <div style="position:absolute;top:0;left:50px;width:160px;height:200px;border-radius:50%;background:#f1c9a5;"></div>
          <div style="position:absolute;top:70px;left:85px;width:20px;height:20px;border-radius:50%;background:#333;"></div>
          <div style="position:absolute;top:70px;left:155px;width:20px;height:20px;border-radius:50%;background:#333;"></div>
          <div style="position:absolute;top:140px;left:100px;width:60px;height:20px;border-bottom:6px solid #a33;border-radius:0 0 40px 40px;"></div>
          <div style="position:absolute;top:210px;left:0;width:260px;height:130px;border-radius:130px 130px 0 0;background:#3b5b8c;"></div>
        </div></body>`;
    } else {
      const isBack = key === 'idBack';
      html = `<body style="margin:0;background:#e9e9e9;display:flex;align-items:center;justify-content:center;height:520px;font-family:Arial,sans-serif;">
        <div style="width:640px;height:400px;background:linear-gradient(135deg,#ffffff,#dce8f5);border:3px solid #1d3b6b;border-radius:18px;padding:24px;box-sizing:border-box;position:relative;">
          <div style="font-weight:bold;font-size:26px;color:#1d3b6b;">DRIVER LICENSE — ${isBack ? 'BACK' : 'FRONT'}</div>
          ${isBack
            ? `<div style="margin-top:40px;height:120px;background:repeating-linear-gradient(90deg,#000 0 3px,#fff 3px 6px);"></div>
               <div style="margin-top:20px;font-size:16px;color:#333;">TEST DOCUMENT — NOT VALID FOR IDENTIFICATION</div>`
            : `<div style="position:absolute;top:80px;left:24px;width:150px;height:190px;background:#b9c7d8;border:2px solid #1d3b6b;"></div>
               <div style="position:absolute;top:84px;left:200px;font-size:20px;line-height:34px;color:#222;">
                 <div>NAME: ${patient.lastName.toUpperCase()}, ${patient.firstName.toUpperCase()}</div>
                 <div>DOB: ${patient.dob}</div>
                 <div>ADDRESS: ${patient.address}, ${patient.city}, ${patient.state} ${patient.zip}</div>
                 <div>DL NO: D1234567</div>
                 <div>EXP: 12/2034</div>
               </div>`}
        </div></body>`;
    }
    await tmp.setContent(html);
    await tmp.screenshot({ path: target, type: 'png' });
    out[key] = target;
    console.log(`   • ${key}: generated placeholder ${target}`);
  }

  if (tmp) await tmp.close().catch(() => {});
  return out;
}

/** Decide which image a file field wants, from its attributes + nearby text. */
function pickImageForHint(hint, images, fallbackIndex) {
  const h = (hint || '').toLowerCase();
  if (/selfie|face|portrait|photo of (you|yourself)|your photo|headshot|liveness/.test(h)) return { key: 'selfie', file: images.selfie };
  if (/back/.test(h))                                                                   return { key: 'idBack',  file: images.idBack };
  if (/front|license|licence|passport|government|\bid\b|identification|document/.test(h)) return { key: 'idFront', file: images.idFront };
  const order = ['idFront', 'selfie', 'idBack'];
  const key = order[fallbackIndex % order.length];
  return { key, file: images[key] };
}

/**
 * Fill every empty <input type=file> on the page (hidden ones included);
 * if there are none, click an upload-looking trigger and answer the chooser.
 * Returns the number of files provided.
 */
async function uploadFilesOnPage(page, images, state) {
  let uploaded = 0;

  // A) native file inputs (usually hidden behind a styled dropzone)
  const inputs = page.locator('input[type="file"]');
  const n = await inputs.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const inp = inputs.nth(i);
    const info = await inp.evaluate(el => {
      const ctx = [];
      let p = el;
      for (let d = 0; d < 4 && p; d++, p = p.parentElement) {
        ctx.push((p.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160));
      }
      return {
        hasFile: !!(el.files && el.files.length),
        hint: [el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('accept'), el.className, ctx.join(' ')].join(' '),
      };
    }).catch(() => null);
    if (!info || info.hasFile) continue;

    const pick = pickImageForHint(info.hint, images, state.uploadedTotal + uploaded);
    try {
      await inp.setInputFiles(pick.file);
      uploaded++;
      console.log(`      📎 Uploaded ${pick.key} → file input #${i}`);
      await page.waitForTimeout(800);
    } catch (e) {
      console.warn(`      ⚠ setInputFiles failed on input #${i}: ${e.message.split('\n')[0]}`);
    }
  }
  if (uploaded) return uploaded;

  // B) no file input yet — click an upload trigger and handle the chooser
  const trigger = page.locator(
    'button:visible, [role="button"]:visible, label:visible, a:visible, ' +
    '[class*="upload" i]:visible, [class*="drop" i]:visible, [class*="camera" i]:visible'
  ).filter({ hasText: /upload|choose (a )?file|browse|select (a )?(file|photo|image)|take (a )?photo|add (a )?photo|drag/i });

  const tn = await trigger.count().catch(() => 0);
  for (let i = 0; i < Math.min(tn, 3); i++) {
    const t = trigger.nth(i);
    const hint = await t.evaluate(el => {
      const ctx = [];
      let p = el;
      for (let d = 0; d < 3 && p; d++, p = p.parentElement) {
        ctx.push((p.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160));
      }
      return ctx.join(' ');
    }).catch(() => '');
    const pick = pickImageForHint(hint, images, state.uploadedTotal + uploaded);
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 4000 }),
        t.click({ timeout: 3000 }),
      ]);
      await chooser.setFiles(pick.file);
      uploaded++;
      console.log(`      📎 Uploaded ${pick.key} via file chooser`);
      await page.waitForTimeout(800);
      break;
    } catch {
      // trigger did not open a chooser (could be a plain text button) — try the next one
    }
  }
  return uploaded;
}

async function bodySnippet(page) {
  return await page.locator('body').innerText()
    .then(t => t.replace(/\s+/g, ' ').trim().slice(0, 600))
    .catch(() => '');
}

/**
 * v17 — drives the whole post-checkout verification wizard.
 * Returns true if at least one step was advanced.
 */
async function completeVerification(page, patient, images) {
  console.log(`      → Handling verification flow: ${page.url()}`);
  const MAX_VERIFY_STEPS = 10;
  const state = { uploadedTotal: 0 };
  let advancedAny = false;
  let idleRounds = 0;

  for (let step = 1; step <= MAX_VERIFY_STEPS; step++) {
    await dismissOverlays(page);
    await waitForPageSettled(page, { timeout: 5000 });

    const urlBefore = page.url();
    const bodyBefore = await bodySnippet(page);
    console.log(`   → Verify sub-step ${step}: ${urlBefore}`);

    // Done already? (confirmation reached)
    if (/thank|success|order-received|receipt|order-confirm|confirmation/i.test(urlBefore) ||
        /thank you|order (has been )?(placed|confirmed|received)|you're all set|verification (complete|submitted)/i.test(bodyBefore)) {
      console.log('      ✓ Confirmation detected during verification');
      return true;
    }

    const scope = page.locator('body');
    let didSomething = 0;

    // SSN last 4, if requested
    const ssnInput = page.locator(
      'input[name*="ssn" i], input[id*="ssn" i], input[aria-label*="SSN" i], ' +
      'input[placeholder*="SSN" i], input[placeholder*="last 4" i], input[name*="last4" i]'
    ).first();
    if (await ssnInput.isVisible({ timeout: 600 }).catch(() => false)) {
      const cur = await ssnInput.inputValue().catch(() => '');
      if (!cur) {
        await ssnInput.click({ timeout: 800 }).catch(() => {});
        await ssnInput.type(patient.ssnLast4, { delay: 60 }).catch(() => {});
        didSomething++;
        console.log(`      ✓ Entered SSN last 4`);
      }
    }

    // Generic text inputs / selects / radios that may appear on a verification step
    didSomething += await fillBasicDetails(scope, patient, CONFIG.credentials);
    didSomething += await fillSelects(scope);
    didSomething += await checkConsentBoxes(scope);
    const answered = await answerBySemantics(page, scope);
    didSomething += answered;

    // File uploads (ID front/back, selfie, ...)
    const up = await uploadFilesOnPage(page, images, state);
    state.uploadedTotal += up;
    didSomething += up;
    if (up) {
      // give the app time to preview / upload / validate the image
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await dismissOverlays(page);
    }

    await snapshot(page, `verify-step-${step}`);

    // Advance
    const advance = await waitForAdvanceEnabled(page, scope, up ? 8000 : 3500);
    if (!advance) {
      console.log(`      ⚠ No enabled Continue/Submit on verify step ${step}`);
      await deepBlockerReport(scope);
      await dumpDom(page, `verify-step-${step}-blocked`);
      idleRounds++;
      if (idleRounds >= 2) break;
      continue;
    }

    const txt = (await advance.innerText().catch(() => '')).trim().slice(0, 60);
    await advance.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await advance.click({ timeout: 3000 }).catch(async () => {
      await advance.click({ timeout: 3000, force: true }).catch(() => {});
    });
    console.log(`      ✓ Clicked verification advance: "${txt}"`);

    // wait for progress
    let progressed = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      await page.waitForTimeout(300);
      const urlNow = page.url();
      const bodyNow = await bodySnippet(page);
      if (urlNow !== urlBefore || bodyNow !== bodyBefore) { progressed = true; break; }
    }
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    if (progressed) {
      advancedAny = true;
      idleRounds = 0;
    } else {
      idleRounds++;
      console.log(`      ⚠ No visible progress after "${txt}" (idle ${idleRounds})`);
      await dumpDom(page, `verify-step-${step}-noprogress`);
      if (idleRounds >= 3) break;
    }
  }

  await dismissOverlays(page);
  return advancedAny;
}

/* =====================================================================
 * v19 FIX G1 — CANCEL TREATMENT AFTER A SUCCESSFUL ORDER
 * ===================================================================== */

const CANCEL_TRIGGER_RE = /cancel\s*(my\s*)?(treatment|order|subscription)/i;
const CANCELLED_TEXT_RE = /(treatment|order|subscription)[^.]{0,60}cancel(l)?ed|cancel(l)?ed\s+(successfully|your)|has been cancel(l)?ed|cancellation\s+(confirmed|complete|successful|requested)/i;

/** Visible "Cancel Treatment" style buttons/links on the current page. */
function cancelTriggers(page) {
  const all = page
    .locator('button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]')
    .filter({ hasText: CANCEL_TRIGGER_RE })
    .filter({ visible: true });
  return all;
}

/** Wait up to timeoutMs for a cancel trigger; prefers "Cancel Treatment". */
async function waitForCancelTrigger(page, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const preferred = cancelTriggers(page).filter({ hasText: /cancel\s*(my\s*)?treatment/i });
    if (await preferred.count().catch(() => 0)) return preferred.first();
    const any = cancelTriggers(page);
    if (await any.count().catch(() => 0)) return any.first();
    await page.waitForTimeout(400);
  }
  return null;
}

/** Open menus (hamburger / avatar / profile) that may hide nav links. */
async function openPossibleMenus(page) {
  const toggles = page.locator(
    '[aria-label*="menu" i], [class*="hamburger" i], [class*="menu-toggle" i], [class*="navbar-toggler" i], ' +
    '[class*="avatar" i], [class*="user-menu" i], [class*="profile" i]'
  ).filter({ visible: true });
  const n = Math.min(await toggles.count().catch(() => 0), 3);
  for (let i = 0; i < n; i++) {
    await toggles.nth(i).click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

/**
 * Find the Cancel Treatment control: current page first, then by browsing
 * through My Treatments / My Orders / Account style links.
 */
async function findCancelTreatmentControl(page) {
  let trigger = await waitForCancelTrigger(page, 6000);
  if (trigger) return trigger;

  const navHints = [
    /my\s*treatments?/i,
    /my\s*orders?/i,
    /order\s*history/i,
    /^orders?$/i,
    /my\s*account/i,
    /^account$/i,
    /dashboard/i,
    /my\s*subscriptions?/i,
    /^profile$/i,
  ];
  for (const re of navHints) {
    const link = page
      .locator('a, button, [role="link"], [role="button"], [role="tab"]')
      .filter({ hasText: re })
      .filter({ visible: true })
      .first();
    if (!(await link.isVisible({ timeout: 500 }).catch(() => false))) continue;

    console.log(`      → Opening "${re.source}" to look for Cancel Treatment`);
    await link.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await link.click({ timeout: 3000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    trigger = await waitForCancelTrigger(page, 4000);
    if (trigger) return trigger;
  }
  return null;
}

/**
 * Cancel the treatment that was just ordered.
 * Handles: native confirm() dialogs (accepted by the page.on('dialog')
 * handler in the test), a cancellation-reason picker (in a modal or on the
 * page the click navigates to) and the final confirm button.
 * NOTE: dismissOverlays() is deliberately NOT called between the clicks,
 * because it would close the confirmation modal.
 * v20: also harvests the order ID from the page before/after cancelling.
 * Returns { clicked, confirmed, cancelled }.
 */
async function cancelTreatment(page) {
  const result = { clicked: false, confirmed: false, cancelled: false };

  const trigger = await findCancelTreatmentControl(page);
  if (!trigger) {
    console.warn('      ⚠ No "Cancel Treatment" control found');
    await snapshot(page, 'cancel-treatment-not-found');
    await dumpDom(page, 'cancel-treatment-not-found');
    return result;
  }

  // v20: the order ID is often shown on the page that hosts the Cancel button
  await captureOrderIdFromPage(page, 'cancel-page');

  await trigger.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  const label = ((await trigger.innerText().catch(() => '')) || '').trim().slice(0, 40);
  const urlBeforeTrigger = page.url();
  const clicked = await trigger.click({ timeout: 4000 }).then(() => true)
    .catch(() => trigger.click({ timeout: 4000, force: true }).then(() => true).catch(() => false));
  if (!clicked) {
    console.warn('      ⚠ Could not click the Cancel Treatment control');
    await snapshot(page, 'cancel-treatment-click-failed');
    await dumpDom(page, 'cancel-treatment-click-failed');
    return result;
  }
  result.clicked = true;
  console.log(`      ✓ Clicked "${label || 'Cancel Treatment'}"`);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await snapshot(page, 'cancel-treatment-clicked');
  await captureOrderIdFromPage(page, 'cancel-page');

  const noRe = /keep|don'?t|do not|go back|^no\b|never\s*mind|not now|close|back$/i;
  const confirmRe = /^(yes\b.*|confirm.*|proceed.*|submit.*|continue.*|cancel\s*(my\s*)?(treatment|order|subscription).*|cancel now|cancel$|okay|ok)$/i;

  for (let round = 1; round <= 4; round++) {
    // If the page already shows a cancelled message, we are done.
    const bodyNow = await page.locator('body').innerText().catch(() => '');
    if (CANCELLED_TEXT_RE.test(bodyNow)) { result.cancelled = true; break; }

    const dialog = page.locator('dialog[open], [role="dialog"]:visible, [role="alertdialog"]:visible, [class*="modal" i]:visible').first();
    const hasDialog = await dialog.isVisible({ timeout: 800 }).catch(() => false);
    const navigated = page.url() !== urlBeforeTrigger;

    // Where is the cancellation form? In a modal, or (if we navigated) on the page.
    const formRoot = hasDialog ? dialog : (navigated ? page.locator('body') : null);
    if (formRoot) {
      // Cancellation reason: radio / custom radio / list row / select / textarea / checkboxes.
      const radio = formRoot.locator('input[type="radio"]:visible, [role="radio"]:visible, .custom-radio-circle:visible, .list-item-row:visible').first();
      if (await radio.isVisible({ timeout: 400 }).catch(() => false)) {
        await radio.click({ timeout: 1500, force: true }).catch(() => {});
        console.log('      ✓ Picked a cancellation reason (radio/list)');
      }
      for (const sel of await formRoot.locator('select:visible').all()) {
        const cur = await sel.inputValue().catch(() => '');
        if (cur) continue;
        const opts = await sel.locator('option').all();
        for (let i = 1; i < opts.length; i++) {
          const v = await opts[i].getAttribute('value');
          if (v) { await sel.selectOption(v).catch(() => {}); console.log('      ✓ Picked a cancellation reason (select)'); break; }
        }
      }
      for (const ta of await formRoot.locator('textarea:visible').all()) {
        const cur = await ta.inputValue().catch(() => '');
        if (!cur) {
          await ta.fill('QA automated test - cancelling test treatment').catch(() => {});
          console.log('      ✓ Filled cancellation notes');
        }
      }
      for (const cb of await formRoot.locator('input[type="checkbox"]:visible').all()) {
        if (!(await cb.isChecked().catch(() => false))) await cb.check().catch(() => {});
      }
      await page.waitForTimeout(300);
    }

    // Find the confirm button. In a modal or on a navigated page, "Cancel Treatment"
    // itself is a valid confirm; otherwise only yes/confirm-style buttons count
    // (avoids re-clicking the original trigger).
    const root = hasDialog ? dialog : page.locator('body');
    const allowCancelText = hasDialog || navigated;
    const buttons = root.locator('button:visible, [role="button"]:visible, input[type="submit"]:visible, a:visible');
    const count = await buttons.count().catch(() => 0);
    let confirmBtn = null;
    for (let i = count - 1; i >= 0; i--) {
      const b = buttons.nth(i);
      const t = ((await b.innerText().catch(() => '')) || (await b.getAttribute('value').catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (!t || noRe.test(t) || !confirmRe.test(t)) continue;
      if (!allowCancelText && CANCEL_TRIGGER_RE.test(t)) continue;
      if (!(await b.isEnabled().catch(() => false))) continue;
      confirmBtn = { el: b, text: t };
      break;
    }

    if (!confirmBtn) {
      if (round === 1) console.log('      • No confirmation step detected');
      break;
    }

    await confirmBtn.el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await confirmBtn.el.click({ timeout: 3000 }).catch(async () => {
      await confirmBtn.el.click({ timeout: 3000, force: true }).catch(() => {});
    });
    result.confirmed = true;
    console.log(`      ✓ Clicked cancel confirmation: "${confirmBtn.text.slice(0, 40)}"`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await snapshot(page, `cancel-treatment-confirm-${round}`);
    await captureOrderIdFromPage(page, 'cancel-page');
  }

  // Final verification — wait briefly for a "cancelled" message.
  if (!result.cancelled) {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const body = await page.locator('body').innerText().catch(() => '');
      if (CANCELLED_TEXT_RE.test(body) || /cancel(l)?ed/i.test(page.url())) { result.cancelled = true; break; }
      await page.waitForTimeout(500);
    }
  }

  await captureOrderIdFromPage(page, 'cancel-page');
  await snapshot(page, 'cancel-treatment-final');
  if (!result.cancelled) await dumpDom(page, 'cancel-treatment-final');
  return result;
}

/* =====================================================================
 * v19 FIX G2 — VERIFY THE CANCELLED STATUS IN ORDER HISTORY
 * ===================================================================== */

const ORDER_HISTORY_LINK_RES = [
  /order\s*history/i,
  /my\s*orders?/i,
  /^orders?$/i,
  /purchase\s*history/i,
  /my\s*treatments?/i,
  /my\s*account/i,
  /^account$/i,
  /dashboard/i,
  /^profile$/i,
];
const ORDER_HISTORY_PATHS = [
  '/order-history', '/orders', '/my-orders', '/account/orders',
  '/account/order-history', '/nd-in-order-history', '/dashboard/orders',
];

/** Does the current page look like an order-history listing? */
async function looksLikeOrderHistory(page) {
  if (/order[-_]?history|my[-_]?orders|\/orders/i.test(page.url())) return true;
  return await page.getByText(/order history|my orders|past orders|order #|order id/i)
    .filter({ visible: true }).first().isVisible({ timeout: 800 }).catch(() => false);
}

/**
 * Open the Order History page: nav links first (after opening any hidden
 * menus), then common URLs. Returns { opened, via }.
 */
async function openOrderHistory(page, baseUrl) {
  // 1) nav links — try straight away, then again after opening menus
  for (const attempt of [1, 2]) {
    if (attempt === 2) await openPossibleMenus(page);
    for (const re of ORDER_HISTORY_LINK_RES) {
      const link = page
        .locator('a, button, [role="link"], [role="button"], [role="tab"], [role="menuitem"]')
        .filter({ hasText: re })
        .filter({ visible: true })
        .first();
      if (!(await link.isVisible({ timeout: 400 }).catch(() => false))) continue;

      console.log(`      → Clicking "${re.source}" to reach order history`);
      await link.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
      await link.click({ timeout: 3000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1000);

      if (await looksLikeOrderHistory(page)) return { opened: true, via: `link ${re.source}` };

      // We landed on an account/dashboard page — look for the history link inside it.
      const inner = page
        .locator('a, button, [role="link"], [role="tab"], [role="menuitem"]')
        .filter({ hasText: /order\s*history|my\s*orders?|^orders?$|purchase\s*history/i })
        .filter({ visible: true })
        .first();
      if (await inner.isVisible({ timeout: 800 }).catch(() => false)) {
        await inner.click({ timeout: 3000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1000);
        if (await looksLikeOrderHistory(page)) return { opened: true, via: `link ${re.source} → inner link` };
      }
    }
  }

  // 2) common URLs
  for (const p of ORDER_HISTORY_PATHS) {
    const resp = await page.goto(`${baseUrl}${p}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    if (!resp || resp.status() >= 400) continue;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (await looksLikeOrderHistory(page)) return { opened: true, via: `url ${p}` };
  }
  return { opened: false, via: null };
}

/**
 * v20 — find the order ID in the Order History row that shows "Cancelled".
 * Walks up from the cancelled label through its ancestors until one of them
 * contains something that looks like an order ID.
 */
async function harvestOrderIdFromHistoryRow(page) {
  const texts = await page.evaluate(() => {
    const out = [];
    const leaves = Array.from(document.querySelectorAll('body *'))
      .filter(e => e.children.length === 0 && /cancel(l)?ed/i.test(e.textContent || ''));
    for (const el of leaves.slice(0, 3)) {
      let p = el;
      for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
        out.push((p.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500));
      }
    }
    return out;
  }).catch(() => []);
  for (const t of texts) {
    const hit = extractOrderId(t);
    if (hit) { recordOrderId(hit.id, 'order-history'); return hit.id; }
  }
  // fall back to anything on the history page
  await captureOrderIdFromPage(page, 'order-history-page');
  return null;
}

/**
 * Open Order History and verify a "Cancelled" status is visible. Reloads
 * once if the status has not updated yet.
 * Returns { opened, cancelledVisible, statusText }.
 */
async function verifyCancelledInOrderHistory(page, baseUrl) {
  const out = { opened: false, cancelledVisible: false, statusText: '' };

  const { opened, via } = await openOrderHistory(page, baseUrl);
  out.opened = opened;
  if (!opened) {
    console.warn('      ⚠ Could not open Order History');
    await snapshot(page, 'order-history-not-found');
    await dumpDom(page, 'order-history-not-found');
    return out;
  }
  console.log(`      ✓ Order History opened (${via}): ${page.url()}`);
  await waitForPageSettled(page, { timeout: 5000 });
  await snapshot(page, 'order-history-opened');

  const cancelledLoc = () => page.getByText(/cancel(l)?ed/i).filter({ visible: true });
  const deadline = Date.now() + 25000;
  let reloaded = false;
  while (Date.now() < deadline) {
    const n = await cancelledLoc().count().catch(() => 0);
    if (n) {
      out.cancelledVisible = true;
      out.statusText = ((await cancelledLoc().first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      break;
    }
    // Status may take a moment to propagate — reload once halfway through.
    if (!reloaded && Date.now() > deadline - 14000) {
      reloaded = true;
      console.log('      • Not showing Cancelled yet — reloading Order History once');
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    }
    await page.waitForTimeout(700);
  }

  if (out.cancelledVisible) await harvestOrderIdFromHistoryRow(page);

  await snapshot(page, 'order-history-final');
  if (out.cancelledVisible) {
    console.log(`      ✓ Order History shows: "${out.statusText}"`);
  } else {
    console.warn('      ⚠ No "Cancelled" status visible in Order History');
    await dumpDom(page, 'order-history-final');
  }
  return out;
}

// ---------- TEST ----------
test.describe('Full Order Flow — Homepage to Order Confirmation', () => {
  test.describe.configure({ mode: 'serial' });

  // v22 FIX J2: browserName + isMobile are used to decide whether to maximize the window
  test('TC-FLOW-E2E-001: Complete purchase funnel end-to-end', async ({ page, context, browserName, isMobile }) => {
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('requestfailed', r => failedRequests.push({ url: r.url(), err: r.failure()?.errorText }));

    // Accept native alert/confirm dialogs (e.g. "Are you sure you want to cancel?")
    page.on('dialog', async d => {
      console.log(`   💬 Native dialog (${d.type()}): "${d.message().slice(0, 100)}" → accepted`);
      await d.accept().catch(() => {});
    });

    // v20: harvest an order ID from order/checkout/payment JSON API responses
    page.on('response', async res => {
      try {
        const url = res.url();
        if (!/order|checkout|payment|subscription|treatment|verif/i.test(url)) return;
        const ct = (res.headers()['content-type'] || '');
        if (!/json/i.test(ct)) return;
        const txt = await res.text();
        const m = txt.match(/"(?:order_?id|orderId|order_?number|orderNumber|order_?no)"\s*:\s*"?([A-Za-z0-9_-]*\d[A-Za-z0-9_-]*)"?/i);
        if (m) recordOrderId(m[1], 'api');
      } catch {}
    });

    // STEP 0 — prepare upload images (v17)
    await log('STEP 0', 'Preparing verification images...');
    const images = await generateTestImages(context, CONFIG.uploads, CONFIG.patient);

    // STEP 1 — HOMEPAGE
    await log('STEP 1', `Homepage: ${CONFIG.baseUrl}`);
    await page.goto(CONFIG.baseUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeouts.long });
    await page.waitForLoadState('networkidle', { timeout: CONFIG.timeouts.medium }).catch(() => {});

    // v22 FIX J2 — maximize only on headed desktop Chromium (CDP is Chromium-only,
    // and the viewport fallback would break mobile emulation on CI)
    if (browserName === 'chromium' && !isMobile && !process.env.CI) {
      await maximizeBrowser(page, context);
    } else {
      console.log(`   • Skipping maximize (${browserName}${isMobile ? ', mobile' : ''}${process.env.CI ? ', CI' : ''})`);
    }

    await dismissOverlays(page);
    await snapshot(page, 'homepage');
    await expect(page).toHaveTitle(/.+/);
    console.log(`   ✓ Title: "${await page.title()}"`);

    // STEP 2 — PDP
    await log('STEP 2', 'Navigating to a product page...');
    const homeUrl = page.url();
    const productCandidates = [
      page.locator('a:has-text("NAD")').filter({ visible: true }),
      page.locator('a:has-text("Glutathione")').filter({ visible: true }),
      page.locator('a:has-text("Sermorelin")').filter({ visible: true }),
      page.locator('a[href*="nd-in"]').filter({ visible: true }),
      page.locator('a[href*="mt-tb"]').filter({ visible: true }),
    ];
    const clickedProduct = await tryFirst(productCandidates, 3000);
    if (!clickedProduct) {
      console.log('   ⚠ No PDP link — going direct to /nd-in');
      await page.goto(`${CONFIG.baseUrl}/nd-in`, { waitUntil: 'domcontentloaded' });
    }
    await page.waitForLoadState('networkidle', { timeout: CONFIG.timeouts.medium }).catch(() => {});
    await dismissOverlays(page);
    await snapshot(page, 'pdp');
    const pdpUrl = page.url();
    console.log(`   ✓ PDP URL: ${pdpUrl}`);
    expect(pdpUrl).not.toBe(homeUrl);
    expect(pdpUrl).toMatch(/nd-in|mt-tb|glutathione|sermorelin|product/i);

    // STEP 3 — START QUALIFY
    await log('STEP 3', 'Starting questionnaire / intake...');
    const beforeStep3 = page.url();
    const startCandidates = [
      page.locator('button:has-text("Get Started")').filter({ visible: true }),
      page.locator('a:has-text("Get Started")').filter({ visible: true }),
      page.locator('button:has-text("Start")').filter({ visible: true }),
      page.locator('a:has-text("Start")').filter({ visible: true }),
      page.locator('button:has-text("Begin")').filter({ visible: true }),
      page.locator('button:has-text("Qualif")').filter({ visible: true }),
      page.locator('button:has-text("Questionnaire")').filter({ visible: true }),
    ];
    const clickedStart = await tryFirst(startCandidates, 3000);
    expect(clickedStart, 'No start CTA on PDP').not.toBeNull();
    await page.waitForURL(u => u.toString() !== beforeStep3, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await dismissOverlays(page);
    await snapshot(page, 'questionnaire-start');
    console.log(`   • URL: ${page.url()}`);

    // STEP 4 — SEMANTIC QUESTIONNAIRE
    await log('STEP 4', 'Filling questionnaire (semantic-intent)...');
    const MAX_STEPS = 40;
    let stepCount = 0;
    let reachedCheckout = false;
    let stallCount = 0;
    const signupState = { attempts: 0 };

    subStepLoop:
    while (stepCount < MAX_STEPS) {
      stepCount++;

      // v20 FIX H1 — never act on a half-rendered step
      await waitForPageSettled(page);
      await dismissOverlays(page);

      const urlBefore = page.url();

      const bodyHashBefore = await page.locator('body').innerText()
        .then(t => t.replace(/\s+/g, ' ').trim().slice(0, 500))
        .catch(() => '');

      console.log(`   → Sub-step ${stepCount}: ${urlBefore}`);

      if (await isPlanCheckoutPage(page)) {
        reachedCheckout = true;
        console.log(`   ✓ Reached plan/checkout page: ${urlBefore}`);
        break;
      }
      if (CHECKOUT_URL_RE.test(urlBefore)) {
        reachedCheckout = true;
        console.log('   ✓ Reached checkout stage');
        break;
      }

      // v20 FIX H1 — signup form check at the top of EVERY sub-step
      if (await handleSignupIfPresent(page, CONFIG.patient, CONFIG.credentials, signupState)) {
        await snapshot(page, `signup-form-${stepCount}`);
        continue;
      }

      await page.waitForTimeout(400);
      const scope = await findInteractiveRoot(page);

      if (stallCount > 0) {
        console.log(`      ⚡ Stall detected — running aggressive unstick pass`);
        await forceClickUnselectedWidgets(page, scope);
        await page.waitForTimeout(400);
      }

      const filledInputs = await fillBasicDetails(scope, CONFIG.patient, CONFIG.credentials);
      if (filledInputs) console.log(`      ✓ Filled ${filledInputs} text input(s)`);

      const filledSnappy = await fillSnappyCustomWidgets(page, scope, CONFIG.patient, CONFIG.credentials);
      if (filledSnappy) console.log(`      ✓ Filled ${filledSnappy} Snappy custom widget(s)`);

      const filledCustom = await fillCustomControls(scope, CONFIG.patient, CONFIG.credentials);
      if (filledCustom) console.log(`      ✓ Filled ${filledCustom} custom control(s)`);

      const filledTAs = await fillTextareas(scope);
      if (filledTAs) console.log(`      ✓ Filled ${filledTAs} textarea(s)`);

      const filledSels = await fillSelects(scope);
      if (filledSels) console.log(`      ✓ Filled ${filledSels} select(s)`);

      const filledSelsPage = await fillSelects(page);
      if (filledSelsPage > filledSels) {
        console.log(`      ✓ Filled ${filledSelsPage - filledSels} page-level select(s)`);
      }

      const checkedBoxes = await checkConsentBoxes(scope);
      if (checkedBoxes) console.log(`      ✓ Checked ${checkedBoxes} consent checkbox(es)`);

      let advanceEl = null;
      for (let pass = 1; pass <= 5; pass++) {
        // v20 FIX H1 — a late-rendering step: settle again on retries and
        // re-check for the signup form / re-run the fillers.
        if (pass > 1) {
          await waitForPageSettled(page, { timeout: 4000 });
          if (await handleSignupIfPresent(page, CONFIG.patient, CONFIG.credentials, signupState)) {
            await snapshot(page, `signup-form-${stepCount}-pass-${pass}`);
            continue subStepLoop;
          }
          const scopeNow = await findInteractiveRoot(page);
          await fillBasicDetails(scopeNow, CONFIG.patient, CONFIG.credentials);
          await fillSelects(scopeNow);
          await fillTextareas(scopeNow);
          await checkConsentBoxes(scopeNow);
        }

        const clicked = await answerBySemantics(page, scope);
        if (clicked) console.log(`      [pass ${pass}] ✓ Answered ${clicked} option(s)`);

        if (clicked === 0) {
          const forceClicked = await forceClickUnselectedWidgets(page, scope);
          if (forceClicked) await page.waitForTimeout(300);
        }

        await dismissOverlays(page);

        advanceEl = await waitForAdvanceEnabled(page, scope, 3000);
        if (advanceEl) break;

        console.warn(`      [pass ${pass}] ⚠ Continue still disabled`);
        await deepBlockerReport(scope);
        await snapshot(page, `step-${stepCount}-pass-${pass}-blocked`);
        await dumpDom(page, `step-${stepCount}-pass-${pass}-blocked`);
        await page.waitForTimeout(700);
      }

      if (!advanceEl) {
        // v20 FIX H1 — last-chance rescue: settle, signup, fillers, re-look for Continue
        console.log(`      ⚠ Could not unblock after passes — last-chance rescue`);
        await waitForPageSettled(page, { timeout: 6000 });
        if (await handleSignupIfPresent(page, CONFIG.patient, CONFIG.credentials, signupState)) {
          continue subStepLoop;
        }
        const scopeRescue = await findInteractiveRoot(page);
        await fillBasicDetails(scopeRescue, CONFIG.patient, CONFIG.credentials);
        await fillSelects(scopeRescue);
        await checkConsentBoxes(scopeRescue);
        advanceEl = await waitForAdvanceEnabled(page, scopeRescue, 3000);
      }

      if (!advanceEl) {
        console.log(`      ⚠ Attempting forced advance`);
        const forced = await forceClickAnyAdvance(page, scope);
        if (forced) {
          await page.waitForTimeout(1500);
          const urlAfterForce = page.url();
          if (urlAfterForce !== urlBefore) {
            console.log(`      ✓ Forced advance changed URL → ${urlAfterForce}`);
            continue;
          }
        }
        console.log(`      ⚠ Still stuck — stopping`);
        await snapshot(page, `stuck-step-${stepCount}`);
        await dumpDom(page, `stuck-step-${stepCount}`);
        break;
      }

      const advanceText = (await advanceEl.innerText().catch(() => '')).trim().slice(0, 60);
      await advanceEl.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
      await advanceEl.click({ timeout: 3000 }).catch(() => {});
      console.log(`      ✓ Clicked advance: "${advanceText}"`);

      const startAfter = Date.now();
      let progressed = false;
      while (Date.now() - startAfter < 3000) {
        await page.waitForTimeout(200);
        const urlNow = page.url();
        const bodyNow = await page.locator('body').innerText()
          .then(t => t.replace(/\s+/g, ' ').trim().slice(0, 500))
          .catch(() => '');
        if (urlNow !== urlBefore || bodyNow !== bodyHashBefore) { progressed = true; break; }
      }

      if (!progressed) {
        stallCount++;
        console.log(`      ⚠ No detectable progress after Continue (stall ${stallCount})`);
        await forceClickUnselectedWidgets(page, scope);
        await page.waitForTimeout(400);
      } else {
        stallCount = 0;
      }

      if (stepCount % 2 === 0) await snapshot(page, `questionnaire-step-${stepCount}`);

      const urlAfter = page.url();
      if (CHECKOUT_URL_RE.test(urlAfter)) {
        reachedCheckout = true;
        console.log(`   ✓ Reached checkout: ${urlAfter}`);
        break;
      }
      if (stallCount >= 3) {
        console.log('      ⚠ Stalled 3 times — dumping and stopping');
        await snapshot(page, `stuck-step-${stepCount}`);
        await dumpDom(page, `stuck-step-${stepCount}`);
        break;
      }
    }

    await snapshot(page, 'after-questionnaire');

    // STEP 5 — CHECKOUT (plan + delivery address + card)
    await log('STEP 5', 'Checkout / payment handling...');
    await waitForPageSettled(page, { timeout: 5000 });
    await dismissOverlays(page);

    const onCheckout = await isPlanCheckoutPage(page)
      || CHECKOUT_URL_RE.test(page.url());

    if (!onCheckout && !reachedCheckout) await dumpDom(page, 'final-not-checkout');

    expect(
      onCheckout || reachedCheckout,
      `Never reached checkout. Final URL: ${page.url()}. Loop ran ${stepCount} sub-step(s). ` +
      `See test-results/flow-steps/`
    ).toBe(true);

    let cardFilled = false;
    try {
      await completePlanCheckout(page, CONFIG);
      cardFilled = true;
    } catch (e) {
      console.warn(`   ⚠ Checkout fill failed: ${e.message}`);
      await snapshot(page, 'checkout-fill-failed');
      await dumpDom(page, 'checkout-fill-failed');
    }

    for (const cb of await page.locator('input[type="checkbox"]').all()) {
      if (await cb.isVisible().catch(() => false)) {
        if (!(await cb.isChecked().catch(() => false))) await cb.check().catch(() => {});
      }
    }

    await snapshot(page, 'checkout-filled');
    expect(cardFilled, `Checkout fields not filled (${page.url()})`).toBe(true);

    // STEP 6 — SUBMIT
    await log('STEP 6', 'Submitting order...');
    const payCandidates = [
      page.getByRole('button', { name: 'Complete Checkout' }),
      page.locator('button:has-text("Complete Checkout")').filter({ visible: true }),
      page.locator('button:has-text("Pay")').filter({ visible: true }),
      page.locator('button:has-text("Place Order")').filter({ visible: true }),
      page.locator('button:has-text("Complete Order")').filter({ visible: true }),
      page.locator('button:has-text("Submit Order")').filter({ visible: true }),
      page.locator('button:has-text("Confirm")').filter({ visible: true }),
      page.locator('button:has-text("Submit")').filter({ visible: true }),
      page.locator('button[type="submit"]').filter({ visible: true }),
    ];
    const payClicked = await tryFirst(payCandidates, 4000);
    expect(payClicked, 'No pay/submit button').not.toBeNull();
    console.log(`   ✓ Clicked pay/submit button → URL now ${page.url()}`);

    await page.waitForLoadState('networkidle', { timeout: CONFIG.timeouts.checkout }).catch(() => {});
    await page.waitForTimeout(4000);
    await dismissOverlays(page);
    await snapshot(page, 'after-submit');
    await captureOrderIdFromPage(page, 'confirmation');

    // STEP 6.5 — POST-CHECKOUT VERIFICATION WITH IMAGE UPLOADS
    await log('STEP 6.5', 'Handling post-checkout verification + image uploads...');
    let verificationRan = false;
    let verificationAdvanced = false;
    let approvedDone = false;
    let lastApproved = null;

    const runVerification = async () => {
      verificationRan = true;
      const adv = await completeVerification(page, CONFIG.patient, images);
      verificationAdvanced = verificationAdvanced || adv;
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await snapshot(page, 'after-verification');
    };
    const onVerifyNow = async () =>
      /complete-verification|verify|identity/i.test(page.url()) ||
      await page.locator('text=/Verify Your Identity/i').first()
        .isVisible({ timeout: 1500 }).catch(() => false);

    for (let round = 1; round <= 4; round++) {
      await waitForPageSettled(page, { timeout: 6000 });

      // v22 FIX J1 — check the wizard FIRST: it can render on the
      // /approved-secure-checkout URL, which would otherwise keep matching
      // isApprovedCheckoutPage() and starve completeVerification().
      if (await onVerifyNow()) {
        await runVerification();
        continue;
      }

      // v21 FIX I2 — second checkout page (/nd-in-approved-secure-checkout)
      if (await isApprovedCheckoutPage(page)) {
        console.log(`   • Approved/secure-checkout page detected (round ${round}): ${page.url()}`);
        const r = await completeApprovedCheckout(page, CONFIG);
        lastApproved = r;
        await snapshot(page, `after-approved-checkout-${round}`);
        if (r.done) { approvedDone = true; break; }
        if (r.handoff === 'verification') await runVerification();
        continue;
      }

      console.log(`   • No further checkout/verification page detected (url=${page.url()})`);
      break;
    }

    // STEP 7 — CONFIRMATION
    await log('STEP 7', 'Verifying order confirmation...');
    const finalUrl = page.url();
    const body = await page.locator('body').innerText().catch(() => '');
    console.log(`   ✓ Final URL: ${finalUrl}`);
    await captureOrderIdFromPage(page, 'confirmation');

    const urlSignal = /thank|confirm|success|order-received|receipt/i.test(finalUrl);
    const textSignal = [
      /thank you/i,
      /order\s+(has been\s+)?(placed|confirmed|received|submitted)/i,
      /confirmation/i,
      /order\s*#?\s*[A-Z0-9]{4,}/i,
      /receipt/i,
      /verification (complete|submitted)/i,
      /you'?re all set/i,
    ].some(r => r.test(body));

    const stillOnVerification = /complete-verification|verify|identity/i.test(finalUrl)
      || /Verify Your Identity/i.test(body);

    const confirmed = urlSignal || textSignal;
    if (confirmed) {
      const best = bestOrderId();
      console.log(`   ✅ Confirmation detected${best ? ` — Order ID: ${best.id}` : ''}`);
    } else if (verificationRan && verificationAdvanced) {
      console.log(`   ✅ Verification wizard completed (URL: ${finalUrl})`);
    } else if (stillOnVerification) {
      console.warn(`   ⚠ Still on verification page after uploads — see verify-step-* artifacts`);
    } else {
      console.warn(`   ⚠ Page snippet: ${body.substring(0, 300)}`);
    }

    // v22 FIX J3 — wait for the Cancel Treatment control instead of a one-shot check
    const cancelAvailable = !!(await waitForCancelTrigger(page, 8000));
    if (cancelAvailable) console.log('   ✅ "Cancel Treatment" control visible — order is placed');
    const orderSucceeded = confirmed || approvedDone || cancelAvailable ||
      (verificationRan && verificationAdvanced && !stillOnVerification);
    if (!orderSucceeded) {
      await logVisibleControls(page, 'STEP 7 final state');
      await snapshot(page, 'step7-final-state');
      await dumpDom(page, 'step7-final-state');
    }
    const finalSnippet = (await bodySnippet(page)).slice(0, 300);
    const finalErrors = orderSucceeded ? [] : await collectValidationErrors(page);
    const controlsSummary = JSON.stringify({ buttons: LAST_CONTROLS.buttons.slice(0, 12), inputs: LAST_CONTROLS.inputs.slice(0, 10) }).slice(0, 1200);
    expect(
      orderSucceeded,
      `Order not completed. Final URL: ${finalUrl}. ` +
      `approvedCheckout=${JSON.stringify(lastApproved)}; verificationRan=${verificationRan}; ` +
      `verificationAdvanced=${verificationAdvanced}. Page: "${finalSnippet}". ` +
      `Errors: ${JSON.stringify(finalErrors)}. Controls: ${controlsSummary}. ` +
      `Check test-results/flow-steps/step7-final-state.* and approved-checkout-* dumps.`
    ).toBe(true);

    // STEP 7.5 — CANCEL TREATMENT (v19 FIX G1)
    await log('STEP 7.5', 'Clicking Cancel Treatment and completing the cancellation...');
    const cancel = await cancelTreatment(page);
    RUN.cancelled = cancel.cancelled;
    if (cancel.cancelled) {
      console.log('   ✅ Cancellation message detected');
    } else if (cancel.clicked) {
      console.warn(`   ⚠ Clicked Cancel Treatment${cancel.confirmed ? ' + confirmation' : ''} but no "cancelled" message appeared — Order History will be the source of truth`);
    }

    // v20 H2 — print email + order ID right after cancelling
    if (cancel.clicked) printCancelledOrderSummary('TREATMENT CANCELLED — ORDER DETAILS');

    expect(
      cancel.clicked,
      `Could not find/click "Cancel Treatment". Final URL: ${page.url()}. ` +
      `See test-results/flow-steps/*cancel-treatment-* screenshots/DOM dumps.`
    ).toBe(true);

    // STEP 7.6 — VERIFY "CANCELLED" IN ORDER HISTORY (v19 FIX G2)
    await log('STEP 7.6', 'Opening Order History and verifying the order shows Cancelled...');
    const history = await verifyCancelledInOrderHistory(page, CONFIG.baseUrl);
    if (history.cancelledVisible) RUN.cancelled = true;

    // v20 H2 — print again now that Order History may have given the real order ID
    printCancelledOrderSummary('ORDER HISTORY CHECK — EMAIL + ORDER ID');

    expect(
      history.opened,
      `Could not open Order History. URL: ${page.url()}. ` +
      `See test-results/flow-steps/*order-history-not-found*`
    ).toBe(true);
    expect(
      history.cancelledVisible,
      `Order History does not show a Cancelled status. URL: ${page.url()}. ` +
      `See test-results/flow-steps/*order-history-final*`
    ).toBe(true);
    console.log(`   ✅ Order History confirms cancellation: "${history.statusText}"`);

    // STEP 8 — DIAGNOSTICS
    await log('STEP 8', 'Post-run diagnostics...');
    if (consoleErrors.length) {
      console.warn(`   ⚠ ${consoleErrors.length} console error(s):`);
      consoleErrors.slice(0, 5).forEach(e => console.warn(`      • ${e.substring(0, 150)}`));
    } else console.log('   ✓ No console errors');
    if (failedRequests.length) {
      console.warn(`   ⚠ ${failedRequests.length} failed request(s):`);
      failedRequests.slice(0, 5).forEach(r => console.warn(`      • ${r.url.substring(0, 120)} → ${r.err}`));
    } else console.log('   ✓ No failed network requests');

    const finalBest = bestOrderId();
    console.log('\n═══════════════════════════════════════════════');
    console.log(' ✅ ORDER PLACED, TREATMENT CANCELLED, ORDER HISTORY SHOWS CANCELLED');
    console.log(` 📧 Email ID : ${currentEmail()}`);
    console.log(` 🧾 Order ID : ${finalBest ? finalBest.id : 'NOT FOUND'}`);
    console.log('═══════════════════════════════════════════════\n');
  });
});