// tests/helpers/linkChecker.js
const axios = require('axios');

/**
 * Extract all actionable links from a Playwright page.
 * Filters out mailto:, tel:, javascript:, and pure hash anchors.
 */
async function extractLinks(page) {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors
      .map(a => {
        let href = a.getAttribute('href') || '';
        try {
          href = new URL(href, window.location.origin).href;
        } catch { /* keep original */ }
        return {
          href,
          text: (a.textContent || '').trim().substring(0, 80),
          isExternal: a.hostname && a.hostname !== window.location.hostname,
          rel: a.getAttribute('rel') || '',
          target: a.getAttribute('target') || '',
        };
      })
      .filter(link => {
        const h = link.href.toLowerCase();
        return (
          h.startsWith('http') &&
          !h.includes('javascript:') &&
          !h.includes('mailto:') &&
          !h.includes('tel:') &&
          !h.endsWith('#') &&
          !h.includes('#/')
        );
      });
  });
}

/**
 * Deduplicate links by href.
 */
function dedupe(links) {
  return [...new Map(links.map(l => [l.href, l])).values()];
}

/**
 * Check a single URL via Playwright's APIRequestContext (with HEAD → GET fallback).
 */
async function checkLink(request, url, timeoutMs = 15000) {
  try {
    const headResp = await request.head(url, {
      timeout: timeoutMs,
      failOnStatusCode: false,
      headers: { 'User-Agent': 'SnappyScriptsQA/1.0' },
    });
    let status = headResp.status();

    // Some servers reject HEAD — retry with GET
    if (status === 405 || status === 501 || status === 403) {
      const getResp = await request.get(url, {
        timeout: timeoutMs,
        failOnStatusCode: false,
        headers: { 'User-Agent': 'SnappyScriptsQA/1.0' },
      });
      status = getResp.status();
    }

    return { url, status, ok: status < 400 };
  } catch (err) {
    return { url, status: 'ERROR', ok: false, error: err.message };
  }
}

/**
 * Batch-check links with concurrency control.
 */
async function checkBatch(request, links, concurrency = 5) {
  const results = [];
  for (let i = 0; i < links.length; i += concurrency) {
    const batch = links.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(link => checkLink(request, link.href))
    );
    results.push(
      ...batchResults.map((r, idx) => ({ ...batch[idx], ...r }))
    );
  }
  return results;
}

/**
 * Validate external links only via axios (avoids Playwright CSP quirks).
 * Use when you need a pure-HTTP check independent of browser context.
 */
async function checkExternalLink(url, timeoutMs = 10000) {
  try {
    const resp = await axios.head(url, {
      timeout: timeoutMs,
      validateStatus: () => true,
      headers: { 'User-Agent': 'SnappyScriptsQA/1.0' },
    });
    return { url, status: resp.status, ok: resp.status < 400 };
  } catch (err) {
    // Retry with GET
    try {
      const resp = await axios.get(url, {
        timeout: timeoutMs,
        validateStatus: () => true,
        headers: { 'User-Agent': 'SnappyScriptsQA/1.0' },
      });
      return { url, status: resp.status, ok: resp.status < 400 };
    } catch (err2) {
      return { url, status: 'ERROR', ok: false, error: err2.message };
    }
  }
}

module.exports = {
  extractLinks,
  dedupe,
  checkLink,
  checkBatch,
  checkExternalLink,
};