# Snappy Scripts Telemed — E2E Test Case Repository

**Project:** Snappy Scripts Telemed Platform  
**Environment:** Staging (`https://staging.snappyscripts.com`)  
**Author:** Senior QA Engineer  
**Document Version:** 1.0  
**Last Updated:** 2025  
**Status:** Active — Ready for Execution

---

## 📋 Table of Contents

1. [Test Case Register](#1-test-case-register)
2. [Detailed Test Cases](#2-detailed-test-cases)
   - [Suite 1: Broken Link Check](#suite-1-broken-link-check)
   - [Suite 2: Responsiveness](#suite-2-responsiveness)
   - [Suite 3: SEO, GEO, AEO & Analytics](#suite-3-seo-geo-aeo--analytics)
   - [Suite 4: Page Performance](#suite-4-page-performance)
   - [Suite 5: LegitScript Content Integrity](#suite-5-legitscript-content-integrity)
   - [Suite 6: Security Vulnerabilities](#suite-6-security-vulnerabilities)
   - [Suite 7: Critical User Flows](#suite-7-critical-user-flows)
3. [Execution Tracker](#3-execution-tracker)
4. [Defect Log](#4-defect-log)
5. [Summary & Risk Assessment](#5-summary--risk-assessment)
6. [Sign-Off & Approvals](#6-sign-off--approvals)

---

## 1. Test Case Register

| TC ID | Suite | Title | Priority | Type | Status | Last Run | Result |
|---|---|---|---|---|---|---|---|
| TC-LINK-001 | Broken Links | All homepage links return valid status codes | High | Functional | Not Run | — | — |
| TC-LINK-002 | Broken Links | Nav from home → PDP / Questionnaire / Checkout | High | Functional | Not Run | — | — |
| TC-RESP-001 | Responsiveness | Layout integrity across 6 viewports | High | UI/UX | Not Run | — | — |
| TC-RESP-002 | Responsiveness | Content containment on 2K/4K | Medium | UI/UX | Not Run | — | — |
| TC-SEO-001 | SEO | Essential meta tags exist on homepage | Medium | SEO | Not Run | — | — |
| TC-SEO-002 | SEO/AEO | Structured data (JSON-LD) validation | Medium | SEO | Not Run | — | — |
| TC-SEO-003 | AEO | FAQ content for answer engines | Medium | SEO | Not Run | — | — |
| TC-GEO-001 | GEO | Geographic / local SEO signals | Low | SEO | Not Run | — | — |
| TC-ANALYTICS-001 | Analytics | GA / GTM tags present | Medium | Analytics | Not Run | — | — |
| TC-PERF-001 | Performance | Lighthouse audit — Core Web Vitals | High | Performance | Not Run | — | — |
| TC-PERF-002 | Performance | Custom page load metrics | High | Performance | Not Run | — | — |
| TC-LEGIT-001 | Compliance | LegitScript badge/content present | **Critical** | Compliance | Not Run | — | — |
| TC-LEGIT-002 | Compliance | LegitScript link resolves correctly | High | Compliance | Not Run | — | — |
| TC-LEGIT-003 | Compliance | Trustpilot rating present & valid | High | Compliance | Not Run | — | — |
| TC-SEC-001 | Security | Critical HTTP security headers | **Critical** | Security | Not Run | — | — |
| TC-SEC-002 | Security | Server info disclosure check | High | Security | Not Run | — | — |
| TC-SEC-003 | Security | HTTPS enforcement | **Critical** | Security | Not Run | — | — |
| TC-SEC-004 | Security | URL parameter reflection (XSS surface) | **Critical** | Security | Not Run | — | — |
| TC-SEC-005 | Security | Checkout HTTPS & form security | **Critical** | Security | Not Run | — | — |
| TC-FLOW-001 | User Flow | Homepage → PDP navigation | High | Functional | Not Run | — | — |
| TC-FLOW-002 | User Flow | Questionnaire entry point accessibility | **Critical** | Functional | Not Run | — | — |
| TC-FLOW-003 | User Flow | Trust & FAQ content verification | High | Content | Not Run | — | — |

**Status Legend:** `Not Run` | `Pass` | `Fail` | `Blocked` | `Skipped` | `In Progress`

---

## 2. Detailed Test Cases

### Suite 1: Broken Link Check

#### TC-LINK-001 — All homepage links return valid status codes

| Field | Value |
|---|---|
| **TC ID** | TC-LINK-001 |
| **Priority** | High |
| **Type** | Functional |
| **Automation File** | `tests/01-broken-links.spec.js` |
| **Test Data** | Homepage URL `https://staging.snappyscripts.com` |

**Preconditions:**
- Staging environment is accessible
- Network access to external domains allowed
- `@playwright/test` and `axios` installed

**Steps:**
1. Navigate to homepage, wait for `networkidle`
2. Extract all `<a href>` from the rendered DOM
3. Filter `mailto:`, `tel:`, `javascript:`, hash-only links
4. Deduplicate URLs
5. For each URL, issue `HEAD` (fallback `GET` on 405/501)
6. Record HTTP status codes

**Expected Result:** All links return HTTP status `< 400`.

**Actual Result:** _(to be filled on execution)_

---

#### TC-LINK-002 — Nav from home → PDP / Questionnaire / Checkout

| Field | Value |
|---|---|
| **TC ID** | TC-LINK-002 |
| **Priority** | High |
| **Type** | Functional |
| **Automation File** | `tests/01-broken-links.spec.js` |

**Steps:**
1. Navigate to homepage
2. Verify presence of product links (NAD+, Glutathione, Sermorelin)
3. Verify presence of Questionnaire / "Get Started" CTA
4. Verify presence of Checkout entry point (or confirmed absence → defect)

**Expected Result:** All three conversion entry points are discoverable from homepage.

**Actual Result:** _(to be filled)_

---

### Suite 2: Responsiveness

#### TC-RESP-001 — Layout integrity across viewports

| Field | Value |
|---|---|
| **TC ID** | TC-RESP-001 |
| **Priority** | High |
| **Type** | UI/UX |
| **Automation File** | `tests/02-responsiveness.spec.js` |

**Viewport Matrix:**

| Viewport | Width | Height | Touch |
|---|---|---|---|
| 2K | 2560 | 1440 | No |
| 4K | 3840 | 2160 | No |
| iPad Pro 12.9" | 1024 | 1366 | Yes |
| iPad Mini | 768 | 1024 | Yes |
| iPhone 14 Pro | 393 | 852 | Yes |
| iPhone SE | 375 | 667 | Yes |

**Steps:**
1. For each viewport, load homepage with matching context
2. Assert no horizontal scrollbar
3. Assert hero visible
4. Assert no overlapping elements in header/nav
5. Assert mobile touch targets ≥ 44×44 px
6. Assert meaningful body content rendered

**Expected Result:** All checks pass on every viewport. No layout breaks.

**Actual Result:** _(to be filled)_

---

#### TC-RESP-002 — Content containment on 2K/4K

| Field | Value |
|---|---|
| **TC ID** | TC-RESP-002 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Automation File** | `tests/02-responsiveness.spec.js` |

**Steps:**
1. Set viewport to 3840×2160
2. Measure widest content container
3. Assert width ≤ 2000 px (design system threshold)

**Expected Result:** Content max-width enforced; no infinite stretch.

**Actual Result:** _(to be filled)_

---

### Suite 3: SEO, GEO, AEO & Analytics

#### TC-SEO-001 — Essential meta tags

| Field | Value |
|---|---|
| **TC ID** | TC-SEO-001 |
| **Priority** | Medium |
| **Type** | SEO |
| **Automation File** | `tests/03-seo-geo-aeo-analytics.spec.js` |

**Validation Checklist:**

| Element | Rule | Pass/Fail |
|---|---|---|
| `<title>` | Present, ≥ 20 chars | — |
| `meta[name="description"]` | Present, ≥ 50 chars | — |
| `<h1>` | Exactly one | — |
| `<html lang>` | Present | — |
| `<link rel="canonical">` | Present (warn if missing) | — |
| `og:title`, `og:description` | Present (warn if missing) | — |
| `og:image` | Present (warn if missing) | — |

**Actual Result:** _(to be filled)_

---

#### TC-SEO-002 — Structured data (JSON-LD)

| Field | Value |
|---|---|
| **TC ID** | TC-SEO-002 |
| **Priority** | Medium |
| **Type** | SEO/AEO |

**Steps:**
1. Extract all `<script type="application/ld+json">` blocks
2. Validate JSON parses
3. Validate `@context` = `https://schema.org`
4. Recommended: `Organization`, `FAQPage`, `Product`

**Expected Result:** ≥ 1 valid JSON-LD block including `FAQPage` (given FAQ section is present).

**Actual Result:** _(to be filled)_

---

#### TC-SEO-003 — FAQ content for AEO

| Field | Value |
|---|---|
| **TC ID** | TC-SEO-003 |
| **Priority** | Medium |
| **Type** | AEO |
| **Source Reference** | Homepage FAQ section (10+ Q&As) |

**Steps:**
1. Locate FAQ section
2. Count question-style headings (ending with `?`)
3. Assert ≥ 3 questions

**Expected Result:** FAQ section visible with ≥ 3 questions.

**Actual Result:** _(to be filled)_

---

#### TC-GEO-001 — Geographic / local SEO signals

| Field | Value |
|---|---|
| **TC ID** | TC-GEO-001 |
| **Priority** | Low |
| **Type** | GEO |

**Signals to verify (soft assertions):**
- "US-based"
- "Board Certified"
- "Licensed provider"
- "United States / USA / U.S."

**Actual Result:** _(to be filled)_

---

#### TC-ANALYTICS-001 — GA / GTM tags present

| Field | Value |
|---|---|
| **TC ID** | TC-ANALYTICS-001 |
| **Priority** | Medium |
| **Type** | Analytics |

**Steps:**
1. Attach request interceptor for `google-analytics.com`, `googletagmanager.com`
2. Load homepage
3. Scan `<script>` tags for `GTM-*`, `G-*`, `UA-*` IDs
4. Verify `window.dataLayer` exists

**Expected Result:** At least one GA/GTM identifier detected (warning if none on staging).

**Actual Result:** _(to be filled)_

---

### Suite 4: Page Performance

#### TC-PERF-001 — Lighthouse audit — Core Web Vitals

| Field | Value |
|---|---|
| **TC ID** | TC-PERF-001 |
| **Priority** | High |
| **Type** | Performance |
| **Tool** | Lighthouse via `playwright-lighthouse` |

**Thresholds (staging baseline):**

| Metric | Threshold |
|---|---|
| Performance Score | ≥ 70 |
| Accessibility Score | ≥ 80 |
| Best Practices | ≥ 80 |
| SEO Score | ≥ 80 |
| LCP | ≤ 4000 ms |
| CLS | ≤ 0.25 |
| TBT | ≤ 600 ms |

**Actual Result:** _(to be filled)_

---

#### TC-PERF-002 — Custom page load metrics

| Field | Value |
|---|---|
| **TC ID** | TC-PERF-002 |
| **Priority** | High |
| **Type** | Performance |

**Metrics captured:** DOMContentLoaded, Load, FP, FCP, LCP, transfer size, resource count.

**Expected Result:** Full load time ≤ 8000 ms.

**Actual Result:** _(to be filled)_

---

### Suite 5: LegitScript Content Integrity

#### TC-LEGIT-001 — LegitScript badge/content present

| Field | Value |
|---|---|
| **TC ID** | TC-LEGIT-001 |
| **Priority** | **Critical** |
| **Type** | Compliance |
| **Business Impact** | Telehealth legal/regulatory trust indicator |

**Steps:**
1. Load homepage
2. Search body text for "LegitScript"
3. Search for images with `legit` in `src`/`alt`/`class`
4. Search trust/certification section
5. Assert at least one signal present

**Expected Result:** LegitScript certification visibly referenced and/or badged.

**Actual Result:** _(to be filled)_

---

#### TC-LEGIT-002 — LegitScript link resolves correctly

| Field | Value |
|---|---|
| **TC ID** | TC-LEGIT-002 |
| **Priority** | High |
| **Type** | Compliance |

**Steps:**
1. Extract all links containing "legitscript" in href or text
2. Assert each returns HTTP < 400

**Actual Result:** _(to be filled)_

---

#### TC-LEGIT-003 — Trustpilot rating present & valid

| Field | Value |
|---|---|
| **TC ID** | TC-LEGIT-003 |
| **Priority** | High |
| **Type** | Compliance |

**Steps:**
1. Extract rating from body text (expected `4.7/5 on Trustpilot`)
2. Assert value 1 ≤ rating ≤ 5
3. Verify Trustpilot widget present

**Actual Result:** _(to be filled)_

---

### Suite 6: Security Vulnerabilities

#### TC-SEC-001 — Critical HTTP security headers

| Field | Value |
|---|---|
| **TC ID** | TC-SEC-001 |
| **Priority** | **Critical** |
| **Type** | Security |

**Headers audit:**

| Header | Required? | Validation |
|---|---|---|
| `Strict-Transport-Security` | ✅ Yes | Contains `max-age=` |
| `X-Content-Type-Options` | ✅ Yes | Exactly `nosniff` |
| `Content-Security-Policy` | ⚠️ Warn | Not containing `unsafe-eval` |
| `X-Frame-Options` | ⚠️ Warn | `DENY` or `SAMEORIGIN` |
| `Referrer-Policy` | ⚠️ Warn | Not `unsafe-url` |
| `Permissions-Policy` | ⚠️ Warn | Non-empty |

**Actual Result:** _(to be filled)_

---

#### TC-SEC-002 — Server info disclosure

| Field | Value |
|---|---|
| **TC ID** | TC-SEC-002 |
| **Priority** | High |
| **Type** | Security |

**Assert:** `X-Powered-By` header absent. Log any `Server`, `X-AspNet*-Version` disclosures.

**Actual Result:** _(to be filled)_

---

#### TC-SEC-003 — HTTPS enforcement

| Field | Value |
|---|---|
| **TC ID** | TC-SEC-003 |
| **Priority** | **Critical** |
| **Type** | Security |

**Steps:**
1. Issue HTTP GET without following redirects
2. Acceptable: 301/302/307/308 → HTTPS, or connection refused
3. Assert redirect target uses `https://`

**Actual Result:** _(to be filled)_

---

#### TC-SEC-004 — URL parameter reflection (XSS surface)

| Field | Value |
|---|---|
| **TC ID** | TC-SEC-004 |
| **Priority** | **Critical** |
| **Type** | Security |

**Payload:** `<script>alert(1)</script>` appended to `?q=`

**Steps:**
1. Register dialog listener
2. Navigate to URL with encoded payload
3. Assert no dialog triggered
4. Assert payload is escaped in DOM (`&lt;script&gt;`)

**Actual Result:** _(to be filled)_

---

#### TC-SEC-005 — Checkout HTTPS & form security

| Field | Value |
|---|---|
| **TC ID** | TC-SEC-005 |
| **Priority** | **Critical** |
| **Type** | Security |

**Steps:**
1. Navigate from homepage to checkout (if link exists)
2. Assert URL is HTTPS
3. Enumerate password / credit card input fields
4. Flag PCI/security review need

**Actual Result:** _(to be filled)_

---

### Suite 7: Critical User Flows

#### TC-FLOW-001 — Homepage → PDP navigation

| Field | Value |
|---|---|
| **TC ID** | TC-FLOW-001 |
| **Priority** | High |
| **Type** | Functional |

**Steps:**
1. Load homepage
2. Locate product link (NAD+ / Glutathione / Sermorelin)
3. Click through
4. Assert PDP heading present
5. Assert PDP CTA ("Add", "Get", "Questionnaire", "Start") visible

**Actual Result:** _(to be filled)_

---

#### TC-FLOW-002 — Questionnaire entry point accessibility

| Field | Value |
|---|---|
| **TC ID** | TC-FLOW-002 |
| **Priority** | **Critical** |
| **Type** | Functional |

**Steps:**
1. Locate Questionnaire / Get Started CTA
2. Click and navigate
3. Assert no 404 page
4. Assert URL reflects questionnaire flow

**Actual Result:** _(to be filled)_

---

#### TC-FLOW-003 — Trust & FAQ content verification

| Field | Value |
|---|---|
| **TC ID** | TC-FLOW-003 |
| **Priority** | High |
| **Type** | Content |

**Required content tokens:**

| Token | Present? |
|---|---|
| NAD+ | — |
| Glutathione | — |
| Sermorelin | — |
| Board Certified | — |
| Questionnaire | — |
| Free Shipping | — |
| Trustpilot | — |
| FAQ section | — |
| "How It Works" | — |

**Actual Result:** _(to be filled)_

---

## 3. Execution Tracker

| Run # | Date | Environment | Build / Commit | Executor | Total | Pass | Fail | Blocked |
|---|---|---|---|---|---|---|---|---|
| 1 | YYYY-MM-DD | staging | — | — | 22 | 0 | 0 | 0 |
| 2 | | | | | | | | |
| 3 | | | | | | | | |

---

## 4. Defect Log

| Defect ID | TC ID | Severity | Summary | Steps to Reproduce | Evidence | Assignee | Status |
|---|---|---|---|---|---|---|---|
| BUG-001 | — | — | — | — | — | — | Open |
| BUG-002 | — | — | — | — | — | — | Open |

**Severity Legend:** `Blocker` | `Critical` | `Major` | `Minor` | `Trivial`

---

## 5. Summary & Risk Assessment

### 5.1 Test Coverage Summary

| Suite | Test Cases | Coverage Area |
|---|---|---|
| Broken Link Check | 2 | All internal/external links, nav to PDP/Questionnaire/Checkout |
| Responsiveness | 2 | 2K, 4K, 3 iPads, 3 iPhones |
| SEO / GEO / AEO / Analytics | 5 | Meta tags, JSON-LD, FAQ, geo signals, GA/GTM |
| Page Performance | 2 | Core Web Vitals + custom timings |
| LegitScript Compliance | 3 | Badge presence, link integrity, Trustpilot |
| Security Vulnerabilities | 5 | Headers, HTTPS, XSS, disclosure, checkout |
| Critical User Flows | 3 | Home→PDP, Questionnaire, Trust content |
| **TOTAL** | **22** | |

### 5.2 Risk Matrix

| Test Suite | Risk if Untested | Likelihood | Impact | Priority |
|---|---|---|---|---|
| Broken Link Check | Navigation failures, SEO penalties, dead-end users | Medium | Medium | **High** |
| Responsiveness | Poor UX on mobile/tablet, lost conversions, brand damage | High | High | **High** |
| SEO / GEO / AEO | Reduced organic traffic, poor discoverability | Medium | Medium | **Medium** |
| Analytics | Blind optimization, no data-driven decisions | Medium | Low | **Medium** |
| Page Performance | High bounce rate, poor Core Web Vitals, ranking drop | High | High | **High** |
| **LegitScript Content** | **Compliance violation, site shutdown risk, legal exposure** | **High** | **Critical** | **🔥 CRITICAL** |
| **Security** | **Data breach, XSS, PCI violation, user trust loss** | **Medium** | **Critical** | **🔥 CRITICAL** |
| User Flows (funnel) | **Direct revenue loss, conversion drop** | **High** | **Critical** | **🔥 CRITICAL** |

### 5.3 Key Observations from Content Analysis

1. **LegitScript reference location**  
   Currently only visible inside a customer testimonial ("*they are LegitScript-certified*"). ⚠️ **Recommendation:** Promote to a dedicated trust badge in footer or hero for regulatory clarity.

2. **Trustpilot rating**  
   Homepage claims "4.7/5 on Trustpilot" — must verify live widget links to the correct business profile and reflects actual current rating.

3. **Checkout entry point**  
   No direct "Checkout" link observed in provided content; conversion appears to flow through the **Questionnaire** → **Doctor Review** → **Medication**. Ensure questionnaire CTA is prominent and reachable from every PDP.

4. **FAQ depth**  
   10+ detailed Q&As present — excellent AEO material. ⚠️ Ensure **`FAQPage` JSON-LD schema** is implemented to maximize answer-engine visibility.

5. **Product PDPs**  
   Three products (NAD+, Glutathione, Sermorelin) — each needs independent PDP SEO validation (title, H1, canonical, Product schema).

6. **Security surface**  
   Telehealth implies PHI/PII handling. Beyond basic header checks, recommend a full **OWASP ZAP** or **Burp Suite** passive scan before production release.

7. **Performance risk**  
   Rich media (badges, testimonial carousel, product imagery) increases LCP risk. Monitor with **Real User Monitoring (RUM)** post-launch.

### 5.4 Exit Criteria for QA Sign-Off

✅ All **Critical** and **High** priority test cases PASS  
✅ Zero **Blocker** / **Critical** severity defects open  
✅ LegitScript content and links validated  
✅ HTTPS enforcement + HSTS + nosniff verified  
✅ Core Web Vitals within thresholds on 3G Fast profile  
✅ No broken links from homepage to conversion funnel  
✅ Cross-viewport layout verified (2K, 4K, iPads, iPhones)

### 5.5 Open Risks / Blockers

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| 1 | LegitScript badge not prominent | Add dedicated badge component | Product/Legal |
| 2 | Missing JSON-LD schema | Implement `Organization`, `FAQPage`, `Product` | Dev |
| 3 | No checkout entry visible | Confirm funnel or add CTA | PM/UX |
| 4 | Analytics on staging may be disabled | Use staging-specific GTM container | DevOps |
| 5 | No CSP header confirmed | Define and deploy CSP | Security |

---

## 6. Sign-Off & Approvals

| Role | Name | Date | Signature |
|---|---|---|---|
| QA Lead | | | |
| Engineering Lead | | | |
| Product Manager | | | |
| Compliance Officer | | | |
| Security Officer | | | |

---

**Document Owner:** QA Team  
**Review Cadence:** After each major staging deployment  
**Next Review:** On next sprint release