const { parseListEnv } = require("../env-utils");

/**
 * Fetch jobs from RSS feeds and simple career-page URLs (no API).
 * RSS_URLS / SCRAPE_URLS in .env.local (comma-separated).
 */
async function fetchScrapedJobs() {
  const jobs = [];

  for (const feedUrl of parseListEnv("RSS_URLS")) {
    try {
      const fromFeed = await fetchRssJobs(feedUrl);
      jobs.push(...fromFeed);
    } catch (err) {
      throw new Error(`RSS ${feedUrl}: ${err.message}`);
    }
  }

  for (const pageUrl of parseListEnv("SCRAPE_URLS")) {
    try {
      const fromPage = await fetchCareerPageJobs(pageUrl);
      jobs.push(...fromPage);
    } catch (err) {
      throw new Error(`Scrape ${pageUrl}: ${err.message}`);
    }
  }

  return jobs;
}

async function fetchRssJobs(feedUrl) {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": "job-tracker-copilot/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const desc = extractTag(block, "description") || extractTag(block, "summary");
    if (!link || !title) continue;

    items.push({
      source: "rss",
      externalId: link,
      company: guessCompanyFromUrl(link),
      title: stripHtml(title),
      location: "",
      remote: /remote/i.test(title + desc),
      url: link.trim(),
      postedAt: extractTag(block, "pubDate") || null,
      description: stripHtml(desc),
      jobText: `${title}\n\n${stripHtml(desc)}`.slice(0, 30000),
    });
  }

  return items;
}

async function fetchCareerPageJobs(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": "job-tracker-copilot/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const links = new Set();
  const hrefRegex = /href=["']([^"']*(?:jobs?|careers?|postings?)[^"']*)["']/gi;
  let m;
  const base = new URL(pageUrl);
  while ((m = hrefRegex.exec(html)) !== null) {
    try {
      const abs = new URL(m[1], base).href;
      if (abs.startsWith("http")) links.add(abs);
    } catch {
      /* skip */
    }
  }

  const jobs = [];
  const max = Number.parseInt(process.env.SCRAPE_MAX_LINKS || "15", 10) || 15;
  for (const url of [...links].slice(0, max)) {
    try {
      const detail = await fetchJobPageText(url);
      if (detail.length < 200) continue;
      jobs.push({
        source: "scrape",
        externalId: url,
        company: guessCompanyFromUrl(url),
        title: guessTitleFromText(detail),
        location: "",
        remote: /remote/i.test(detail),
        url,
        postedAt: null,
        description: detail.slice(0, 5000),
        jobText: detail.slice(0, 30000),
      });
      await sleep(500);
    } catch {
      /* skip broken links */
    }
  }

  return jobs;
}

async function fetchJobPageText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "job-tracker-copilot/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guessCompanyFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.split(".")[0];
  } catch {
    return "";
  }
}

function guessTitleFromText(text) {
  const first = text.split(/[.!?\n]/)[0]?.trim();
  return (first || "Role").slice(0, 120);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { fetchScrapedJobs, fetchRssJobs };
