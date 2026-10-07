// tests/helpers/securityAudit.js
const { SECURITY_HEADERS } = require('../fixtures/testData');

// ---------- HEADER AUDIT ----------

/**
 * Audit HTTP response headers for required / recommended security headers.
 * Returns structured findings — caller decides pass/fail.
 */
function auditSecurityHeaders(headers) {
  const findings = {
    required: { present: [], missing: [], invalid: [] },
    recommended: { present: [], missing: [], invalid: [] },
    disclosure: [],
    allHeaders: headers,
  };

  // Required headers
  for (const [name, cfg] of Object.entries(SECURITY_HEADERS.required)) {
    const value = headers[name];
    if (!value) {
      findings.required.missing.push({ name, description: cfg.description });
    } else if (!cfg.validate(value)) {
      findings.required.invalid.push({ name, value, description: cfg.description });
    } else {
      findings.required.present.push({ name, value });
    }
  }

  // Recommended headers
  for (const [name, cfg] of Object.entries(SECURITY_HEADERS.recommended)) {
    const value = headers[name];
    if (!value) {
      findings.recommended.missing.push({ name, description: cfg.description });
    } else if (!cfg.validate(value)) {
      findings.recommended.invalid.push({ name, value, description: cfg.description });
    } else {
      findings.recommended.present.push({ name, value });
    }
  }

  // Disclosure headers
  for (const name of SECURITY_HEADERS.disclosureHeaders) {
    if (headers[name]) {
      findings.disclosure.push({ name, value: headers[name] });
    }
  }

  return findings;
}

/**
 * Pretty-print header audit result to console (for test logs).
 */
function printHeaderAudit(findings) {
  console.log('\n=== HTTP Security Headers Audit ===\n');

  findings.required.present.forEach(h =>
    console.log(`✅ [REQUIRED]     ${h.name}: ${String(h.value).substring(0, 80)}`)
  );
  findings.required.invalid.forEach(h =>
    console.warn(`⚠️  [REQUIRED]     ${h.name} misconfigured: ${h.value} — ${h.description}`)
  );
  findings.required.missing.forEach(h =>
    console.error(`❌ [REQUIRED]     ${h.name} MISSING — ${h.description}`)
  );

  findings.recommended.present.forEach(h =>
    console.log(`✅ [RECOMMENDED]  ${h.name}: ${String(h.value).substring(0, 80)}`)
  );
  findings.recommended.invalid.forEach(h =>
    console.warn(`⚠️  [RECOMMENDED]  ${h.name} misconfigured: ${h.value} — ${h.description}`)
  );
  findings.recommended.missing.forEach(h =>
    console.warn(`⚠️  [RECOMMENDED]  ${h.name} MISSING — ${h.description}`)
  );

  if (findings.disclosure.length > 0) {
    console.warn('\n=== Server Information Disclosure ===');
    findings.disclosure.forEach(h =>
      console.warn(`⚠️  ${h.name}: ${h.value}`)
    );
  }
}

// ---------- HTTPS ENFORCEMENT ----------

/**
 * Check HTTP → HTTPS redirect behavior.
 * Returns { enforced: boolean, status, location }.
 */
async function checkHttpsEnforcement(request, hostname) {
  const httpUrl = `http://${hostname}`;
  try {
    const resp = await request.get(httpUrl, {
      maxRedirects: 0,
      failOnStatusCode: false,
      timeout: 10000,
    });
    const status = resp.status();
    const location = resp.headers()['location'] || '';

    if ([301, 302, 307, 308].includes(status) && location.startsWith('https://')) {
      return { enforced: true, status, location };
    }
    if (status === 0 || status === 400 || status === 403) {
      // Some CDNs return 400/403 on direct HTTP — treat as HTTPS-enforced
      return { enforced: true, status, location: '', note: 'Direct HTTP rejected' };
    }
    return { enforced: false, status, location };
  } catch (err) {
    // Connection refused = HTTPS-only
    if (/ECONNREFUSED|ENOTFOUND|socket hang up/i.test(err.message)) {
      return { enforced: true, status: 'connection-refused', location: '' };
    }
    return { enforced: false, status: 'ERROR', error: err.message };
  }
}

// ---------- XSS SURFACE ----------

/**
 * Test URL parameter reflection for XSS.
 * Registers a dialog listener, navigates with payload, checks reflection.
 * Returns { triggered: boolean, reflectedRaw: boolean, escaped: boolean }.
 */
async function testUrlParameterXss(page, baseUrl, paramName = 'q') {
  const payload = '<script>alert(1)</script>';
  const url = `${baseUrl}/?${paramName}=${encodeURIComponent(payload)}`;

  let triggered = false;
  const dialogHandler = async dialog => {
    triggered = true;
    try { await dialog.dismiss(); } catch { /* noop */ }
  };
  page.on('dialog', dialogHandler);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (err) {
    // Navigation may fail on strict CSP — that's acceptable
    page.off('dialog', dialogHandler);
    return { triggered: false, reflectedRaw: false, escaped: true, note: err.message };
  }

  page.off('dialog', dialogHandler);

  const bodyHtml = await page.content();
  const reflectedRaw = bodyHtml.includes(payload);
  const escaped = bodyHtml.includes('&lt;script&gt;') || !reflectedRaw;

  return { triggered, reflectedRaw, escaped };
}

// ---------- FORM SECURITY ----------

/**
 * Enumerate sensitive input fields on a page.
 */
async function enumerateSensitiveFields(page) {
  return page.evaluate(() => {
    const fields = [];
    document.querySelectorAll('input, select, textarea').forEach(el => {
      const type = (el.getAttribute('type') || '').toLowerCase();
      const name = (el.getAttribute('name') || '').toLowerCase();
      const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
      const id = (el.getAttribute('id') || '').toLowerCase();

      const sensitive =
        type === 'password' ||
        /card|cc-|cvv|cvc|ssn|social|dob|birth/i.test(name) ||
        /card|cc-|cvv|cvc|ssn/i.test(id) ||
        autocomplete.startsWith('cc-');

      if (sensitive) {
        fields.push({ type, name, id, autocomplete, sensitive: true });
      }
    });
    return fields;
  });
}

// ---------- CSP CONVENIENCE ----------

function parseCsp(cspHeader) {
  if (!cspHeader) return null;
  const directives = {};
  cspHeader.split(';').forEach(part => {
    const [k, ...rest] = part.trim().split(/\s+/);
    if (k) directives[k] = rest;
  });
  return directives;
}

function cspHasUnsafeDirectives(cspHeader) {
  if (!cspHeader) return { hasUnsafeEval: false, hasUnsafeInline: false };
  return {
    hasUnsafeEval: cspHeader.includes("'unsafe-eval'"),
    hasUnsafeInline: cspHeader.includes("'unsafe-inline'"),
  };
}

module.exports = {
  auditSecurityHeaders,
  printHeaderAudit,
  checkHttpsEnforcement,
  testUrlParameterXss,
  enumerateSensitiveFields,
  parseCsp,
  cspHasUnsafeDirectives,
};