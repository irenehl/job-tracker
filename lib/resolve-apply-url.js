const { detectAts, resolveAtsUrl } = require("./ats-detect");
const { parseBoolEnv, parseIntEnv } = require("./env-utils");
const { resolveHimalayasApplyUrl } = require("./himalayas-resolve");
const {
  extractAtsUrlsFromText,
  pickFirstAtsUrl,
  normalizeAtsUrl,
} = require("./ats-url-extract");

const AGGREGATOR_PATTERNS = [
  /himalayas\.app/i,
  /remoteok\.com/i,
  /weworkremotely\.com/i,
  /linkedin\.com/i,
  /indeed\.com/i,
  /glassdoor\.com/i,
  /ziprecruiter\.com/i,
  /monster\.com/i,
];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

let lastFetchAt = 0;

function isResolveEnabled() {
  return parseBoolEnv("RESOLVE_ATS_URLS", true);
}

function isAggregatorUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return false;
  if (detectAts(trimmed)) return false;
  return AGGREGATOR_PATTERNS.some((p) => p.test(trimmed));
}

function inferAggregatorLabel(url, source) {
  if (source) return source;
  if (/himalayas\.app/i.test(url)) return "himalayas";
  if (/remoteok\.com/i.test(url)) return "remoteok";
  return "aggregator";
}

async function rateLimit(options = {}) {
  const minMs = options.minDelayMs ?? parseIntEnv("RESOLVE_ATS_MIN_DELAY_MS", 750);
  const now = Date.now();
  const wait = lastFetchAt + minMs - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();
}

async function fetchPageText(url, { timeoutMs = 10000 } = {}) {
  await rateLimit();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: FETCH_HEADERS,
    });
    const finalUrl = res.url || url;
    if (!res.ok) return { html: "", finalUrl, ok: false };
    const html = await res.text();
    return { html, finalUrl, ok: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve an aggregator or redirect URL to a Greenhouse/Lever/Ashby apply link.
 * Returns { resolvedUrl, ats, source: 'resolved'|'direct', originalUrl } or null.
 */
async function resolveApplyUrl(url, options = {}) {
  if (!isResolveEnabled()) return null;

  const originalUrl = String(url || "").trim();
  if (!originalUrl) return null;

  const direct = detectAts(originalUrl);
  if (direct) {
    return {
      resolvedUrl: originalUrl,
      ats: direct,
      source: "direct",
      originalUrl,
    };
  }

  const hint = options.description || options.htmlHint || "";
  const fromHint = pickFirstAtsUrl(hint);
  if (fromHint) {
    return {
      resolvedUrl: fromHint,
      ats: detectAts(fromHint),
      source: "resolved",
      originalUrl,
      via: "description",
    };
  }

  if (/himalayas\.app/i.test(originalUrl)) {
    try {
      const himalayas = await resolveHimalayasApplyUrl(originalUrl);
      if (himalayas?.resolvedUrl && detectAts(himalayas.resolvedUrl)) {
        return {
          resolvedUrl: himalayas.resolvedUrl,
          ats: himalayas.ats || detectAts(himalayas.resolvedUrl),
          source: "resolved",
          originalUrl,
          via: himalayas.via || "himalayas-api",
        };
      }
    } catch {
      /* non-blocking */
    }
  }

  const timeoutMs = options.timeoutMs ?? parseIntEnv("RESOLVE_ATS_TIMEOUT_MS", 10000);

  try {
    const followed = await resolveAtsUrl(originalUrl, { timeoutMs });
    if (followed.ats) {
      return {
        resolvedUrl: followed.resolvedUrl,
        ats: followed.ats,
        source: followed.followedRedirect ? "resolved" : "direct",
        originalUrl,
        via: "redirect",
      };
    }
  } catch {
    /* non-blocking */
  }

  if (!options.forceFetch && !isAggregatorUrl(originalUrl)) return null;

  try {
    const { html, finalUrl } = await fetchPageText(originalUrl, { timeoutMs });

    const fromFinal = detectAts(finalUrl);
    if (fromFinal) {
      return {
        resolvedUrl: finalUrl,
        ats: fromFinal,
        source: "resolved",
        originalUrl,
        via: "redirect",
      };
    }

    const links = extractAtsUrlsFromText(html);
    if (links.length) {
      return {
        resolvedUrl: links[0],
        ats: detectAts(links[0]),
        source: "resolved",
        originalUrl,
        via: "html",
      };
    }

    const remoteOkApply = html.match(/class="button action-apply"[^>]*href="(\/l\/\d+)"/i);
    if (remoteOkApply) {
      const applyPage = `https://remoteok.com${remoteOkApply[1]}`;
      const nested = await fetchPageText(applyPage, { timeoutMs });
      const nestedLinks = extractAtsUrlsFromText(nested.html);
      if (nestedLinks.length) {
        return {
          resolvedUrl: nestedLinks[0],
          ats: detectAts(nestedLinks[0]),
          source: "resolved",
          originalUrl,
          via: "remoteok-apply",
        };
      }
    }
  } catch {
    /* non-blocking */
  }

  return null;
}

module.exports = {
  isResolveEnabled,
  isAggregatorUrl,
  inferAggregatorLabel,
  extractAtsUrlsFromText,
  pickFirstAtsUrl,
  resolveApplyUrl,
  FETCH_HEADERS,
};
