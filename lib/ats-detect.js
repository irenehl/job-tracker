const {
  parseGreenhouseUrl,
  parseLeverUrl,
  parseAshbyUrl,
} = require("./fetch-job-url");

const ATS_TYPES = ["greenhouse", "lever", "ashby"];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function detectAts(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  if (parseGreenhouseUrl(trimmed)) {
    return { type: "greenhouse", parsed: parseGreenhouseUrl(trimmed) };
  }
  if (parseLeverUrl(trimmed)) {
    return { type: "lever", parsed: parseLeverUrl(trimmed) };
  }
  if (parseAshbyUrl(trimmed)) {
    return { type: "ashby", parsed: parseAshbyUrl(trimmed) };
  }

  if (/greenhouse\.io/i.test(trimmed)) return { type: "greenhouse", parsed: null };
  if (/lever\.co/i.test(trimmed)) return { type: "lever", parsed: null };
  if (/ashbyhq\.com/i.test(trimmed)) return { type: "ashby", parsed: null };

  return null;
}

function isAtsAllowed(atsType, allowedList) {
  if (!atsType) return false;
  const allowed = (allowedList || ["greenhouse"])
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(String(atsType).toLowerCase());
}

function atsBlockerHint(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    return " Set Application Link to a Greenhouse/Lever/Ashby posting URL.";
  }
  if (/example\.com/i.test(trimmed)) {
    return " Placeholder/test URL — replace with a real ATS posting (e.g. boards.greenhouse.io/…/jobs/…).";
  }
  if (/himalayas\.app/i.test(trimmed)) {
    return " Himalayas aggregator link — resolution uses the Himalayas search API + ATS board title match (HTML is Cloudflare-blocked). If resolution failed, set GREENHOUSE_BOARDS/LEVER_SITES/ASHBY_BOARDS or paste the ATS URL into Notion.";
  }
  return " Ingest via GREENHOUSE_BOARDS (or LEVER_SITES/ASHBY_BOARDS) in .env.local, or set Application Link to the ATS URL directly.";
}

async function followUrlForAts(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetch(url, {
          method,
          redirect: "follow",
          signal: controller.signal,
          headers: FETCH_HEADERS,
        });
        const finalUrl = res.url || url;
        const ats = detectAts(finalUrl);
        if (ats) {
          return { ats, resolvedUrl: finalUrl, followedRedirect: finalUrl !== url };
        }
        if (method === "GET" && res.ok) {
          const html = await res.text();
          const linkPattern =
            /https?:\/\/[^"'\\s<>]*(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)[^"'\\s<>]*/gi;
          for (const linkMatch of html.matchAll(linkPattern)) {
            const linked = linkMatch[0].replace(/&amp;/g, "&");
            const fromHtml = detectAts(linked);
            if (fromHtml) {
              return { ats: fromHtml, resolvedUrl: linked, followedRedirect: true };
            }
          }
        }
      } catch {
        /* try GET after HEAD failure */
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Detect ATS on URL; optionally follow redirects / scrape apply link from HTML.
 */
async function resolveAtsUrl(url, options = {}) {
  const originalUrl = String(url || "").trim();
  const direct = detectAts(originalUrl);
  if (direct) {
    return {
      ats: direct,
      resolvedUrl: originalUrl,
      originalUrl,
      followedRedirect: false,
    };
  }
  if (!originalUrl) {
    return { ats: null, resolvedUrl: originalUrl, originalUrl, followedRedirect: false };
  }

  const followed = await followUrlForAts(originalUrl, options);
  if (followed) {
    return { ...followed, originalUrl };
  }

  return { ats: null, resolvedUrl: originalUrl, originalUrl, followedRedirect: false };
}

module.exports = {
  detectAts,
  isAtsAllowed,
  atsBlockerHint,
  resolveAtsUrl,
  ATS_TYPES,
};
