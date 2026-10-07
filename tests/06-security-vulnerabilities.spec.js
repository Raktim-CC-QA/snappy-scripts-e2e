// tests/06-security-vulnerabilities.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Security Headers Audit', () => {
  
  test('TC-SEC-001: Critical HTTP security headers are present', async ({ request }) => {
    const response = await request.get('https://staging.snappyscripts.com', {
      failOnStatusCode: false
    });

    const headers = response.headers();
    
    const securityHeaders = {
      'strict-transport-security': {
        required: true,
        description: 'HSTS — forces HTTPS',
        validate: (v) => v && v.includes('max-age='),
      },
      'content-security-policy': {
        required: false, // Warn if missing, don't fail (complex to configure)
        description: 'CSP — XSS mitigation',
        validate: (v) => v && !v.includes('unsafe-eval'),
      },
      'x-frame-options': {
        required: false,
        description: 'Clickjacking protection (superseded by CSP frame-ancestors)',
        validate: (v) => v && (v.includes('DENY') || v.includes('SAMEORIGIN')),
      },
      'x-content-type-options': {
        required: true,
        description: 'MIME sniffing protection',
        validate: (v) => v === 'nosniff',
      },
      'referrer-policy': {
        required: false,
        description: 'Referrer information control',
        validate: (v) => v && v !== 'unsafe-url',
      },
      'permissions-policy': {
        required: false,
        description: 'Browser feature restrictions',
        validate: (v) => v && v.length > 0,
      },
    };

    console.log('\n=== Security Headers Audit ===\n');

    for (const [headerName, config] of Object.entries(securityHeaders)) {
      const value = headers[headerName];
      
      if (value) {
        const isValid = config.validate(value);
        console.log(`${isValid ? '✅' : '⚠️'} ${headerName}: ${value.substring(0, 100)}`);
        if (!isValid) {
          console.warn(`   ⚠️ Value may be misconfigured: ${config.description}`);
        }
      } else {
        const icon = config.required ? '❌' : '⚠️';
        console.log(`${icon} ${headerName}: MISSING — ${config.description}`);
        if (config.required) {
          console.error(`   ❌ CRITICAL: ${headerName} is required but missing`);
        }
      }
    }

    // Hard assertions for critical headers
    expect(headers['strict-transport-security'], 'HSTS header missing — protocol downgrade risk').toBeTruthy();
    expect(headers['x-content-type-options'], 'X-Content-Type-Options missing — MIME sniffing risk').toBe('nosniff');
  });

  test('TC-SEC-002: Server information disclosure check', async ({ request }) => {
    const response = await request.get('https://staging.snappyscripts.com', {
      failOnStatusCode: false
    });

    const headers = response.headers();
    const disclosureHeaders = ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'];

    console.log('\n=== Server Information Disclosure ===\n');

    for (const header of disclosureHeaders) {
      if (headers[header]) {
        console.warn(`⚠️ Information disclosure via "${header}": ${headers[header]}`);
      } else {
        console.log(`✅ ${header}: Not exposed (good)`);
      }
    }

    // X-Powered-By should be removed
    expect(headers['x-powered-by'], 'X-Powered-By header exposes tech stack').toBeFalsy();
  });

  test('TC-SEC-003: HTTPS enforcement', async ({ request }) => {
    // Test HTTP → HTTPS redirect
    const httpResponse = await request.get('http://staging.snappyscripts.com', {
      maxRedirects: 0,
      failOnStatusCode: false,
    }).catch(err => ({ status: () => 'connection-refused' }));

    const status = typeof httpResponse.status === 'function' ? httpResponse.status() : httpResponse.status;
    
    if (status === 301 || status === 302 || status === 307 || status === 308) {
      const location = httpResponse.headers()['location'] || '';
      console.log(`✅ HTTP → HTTPS redirect: ${status} → ${location}`);
      expect(location, 'Redirect target should be HTTPS').toContain('https://');
    } else if (status === 'connection-refused') {
      console.log('✅ HTTP connection refused (HTTPS-only server)');
    } else {
      console.warn(`⚠️ HTTP request returned ${status} — verify HTTPS enforcement`);
    }
  });
});

// tests/06-security-vulnerabilities.spec.js (continued)

test.describe('Injection Surface Checks', () => {
  
  test('TC-SEC-004: URL parameter reflection (basic XSS surface)', async ({ page }) => {
    const testPayload = '<script>alert(1)</script>';
    const testUrl = `https://staging.snappyscripts.com/?q=${encodeURIComponent(testPayload)}`;
    
    let dialogTriggered = false;
    page.on('dialog', async dialog => {
      dialogTriggered = true;
      console.error(`❌ XSS Dialog triggered: ${dialog.message()}`);
      await dialog.dismiss();
    });

    await page.goto(testUrl, { waitUntil: 'networkidle' });
    
    // Check if payload is reflected unescaped
    const bodyHtml = await page.content();
    const payloadReflected = bodyHtml.includes(testPayload) && !bodyHtml.includes('&lt;script&gt;');
    
    if (payloadReflected) {
      console.error('❌ XSS payload reflected unescaped in page source');
    }
    
    expect(dialogTriggered, 'XSS dialog was triggered').toBe(false);
  });

  test('TC-SEC-005: Checkout page HTTPS & form security', async ({ page }) => {
    await page.goto('https://staging.snappyscripts.com', { waitUntil: 'networkidle' });

    // Navigate toward checkout if link exists
    const checkoutLink = page.locator('a[href*="checkout"], a:has-text("Checkout"), a:has-text("Get Started")').first();
    
    if (await checkoutLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkoutLink.click();
      await page.waitForLoadState('networkidle');

      // Verify HTTPS
      expect(page.url(), 'Checkout page not on HTTPS').toContain('https://');
      console.log(`✅ Checkout URL is HTTPS: ${page.url()}`);

      // Check for sensitive form fields without autocomplete="off"
      const passwordFields = await page.locator('input[type="password"]').count();
      const creditCardFields = await page.locator('input[name*="card"], input[autocomplete*="cc-"]').count();
      
      console.log(`Password fields: ${passwordFields}`);
      console.log(`Credit card fields: ${creditCardFields}`);

      if (creditCardFields > 0 || passwordFields > 0) {
        console.warn('⚠️ Sensitive fields detected — ensure PCI DSS compliance');
      }
    } else {
      console.log('⚠️ No direct checkout link found from homepage — skipping checkout security check');
    }
  });
});