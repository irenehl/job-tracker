const { pickFirstAtsUrl } = require("./ats-url-extract");
const { detectAts } = require("./ats-detect");
const { parseListEnv } = require("./env-utils");

const SEARCH_BASE = "https://himalayas.app/jobs/api/search";
const GH_API = "https://boards-api.greenhouse.io/v1/boards";
const LEVER_API = "https://api.lever.co/v0/postings";
const ASHBY_API = "https://api.ashbyhq.com/posting-api/job-board";

/** Himalayas company slug → public ATS board token (when slug differs). */
const KNOWN_BOARD_ALIASES = {
  "grafana-labs": { greenhouse: ["grafanalabs"] },
  pindrop: { greenhouse: ["pindropsecurity"] },
  "clipboard-health": { ashby: ["clipboard"] },
  "work-mercor": { ashby: ["mercor"] },
  "truelogic-io": { ashby: ["truelogic"] },
  g2i: { ashby: ["g2i"] },
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "remote",
  "fully",
  "us",
  "uk",
  "eu",
  "or",
  "all",
  "genders",
]);

function parseHimalayasUrl(url) {
  const m = String(url || "").match(
    /himalayas\.app\/companies\/([^/]+)\/jobs\/([^/?#]+)/i
  );
  if (!m) return null;
  return { companySlug: m[1].toLowerCase(), jobSlug: m[2].toLowerCase() };
}

function slugToTitle(jobSlug) {
  return String(jobSlug || "")
    .replace(/-\d{6,}$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function titleKeywords(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function titleMatchScore(a, b) {
  const wa = titleKeywords(a);
  const wb = titleKeywords(b);
  if (!wa.length || !wb.length) return 0;
  const hits = wa.filter((w) => wb.some((x) => x.includes(w) || w.includes(x)));
  return hits.length / wa.length;
}

function deriveBoardTokens(companySlug) {
  const slug = String(companySlug || "").toLowerCase();
  const base = slug
    .replace(/-inc$/, "")
    .replace(/-technologies$/, "")
    .replace(/-labs$/, "")
    .replace(/-io$/, "")
    .replace(/-group$/, "");

  const tokens = new Set([
    slug,
    base,
    slug.replace(/-/g, ""),
    base.replace(/-/g, ""),
    `${base}inc`,
    `${base}labs`,
    `${base}security`,
    `${base}technologies`,
    `get${base.replace(/-/g, "")}`,
  ]);

  const alias = KNOWN_BOARD_ALIASES[slug];
  if (alias?.greenhouse) alias.greenhouse.forEach((t) => tokens.add(t));
  if (alias?.ashby) alias.ashby.forEach((t) => tokens.add(t));
  if (alias?.lever) alias.lever.forEach((t) => tokens.add(t));

  for (const configured of parseListEnv("GREENHOUSE_BOARDS")) tokens.add(configured);
  for (const configured of parseListEnv("LEVER_SITES")) tokens.add(configured);
  for (const configured of parseListEnv("ASHBY_BOARDS")) tokens.add(configured);

  return [...tokens].filter(Boolean);
}


async function fetchHimalayasCompanyJobs(companySlug, { maxPages = 3 } = {}) {
  const jobs = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      company: companySlug,
      page: String(page),
      sort: "recent",
    });
    const res = await fetch(`${SEARCH_BASE}?${params.toString()}`);
    if (!res.ok) break;
    const data = await res.json();
    const batch = Array.isArray(data.jobs) ? data.jobs : [];
    if (!batch.length) break;
    jobs.push(...batch);
    if (batch.length < (data.limit || 20)) break;
  }
  return jobs;
}

function findHimalayasJob(jobs, jobSlug) {
  const exact = jobs.find(
    (j) =>
      j.applicationLink?.includes(`/jobs/${jobSlug}`) ||
      j.guid?.includes(`/jobs/${jobSlug}`)
  );
  if (exact) return exact;

  const baseSlug = jobSlug.replace(/-\d+$/, "");
  return jobs.find(
    (j) =>
      j.applicationLink?.includes(`/jobs/${baseSlug}`) ||
      j.guid?.includes(`/jobs/${baseSlug}`)
  );
}

const boardCache = {
  greenhouse: new Map(),
  lever: new Map(),
  ashby: new Map(),
};

async function getGreenhouseJobs(token) {
  if (boardCache.greenhouse.has(token)) return boardCache.greenhouse.get(token);
  const jobs = await fetchGreenhouseJobs(token);
  boardCache.greenhouse.set(token, jobs);
  return jobs;
}

async function getLeverJobs(token) {
  if (boardCache.lever.has(token)) return boardCache.lever.get(token);
  const jobs = await fetchLeverJobs(token);
  boardCache.lever.set(token, jobs);
  return jobs;
}

async function getAshbyJobs(token) {
  if (boardCache.ashby.has(token)) return boardCache.ashby.get(token);
  const jobs = await fetchAshbyJobs(token);
  boardCache.ashby.set(token, jobs);
  return jobs;
}

function orderedTokens(companySlug, type) {
  const alias = KNOWN_BOARD_ALIASES[companySlug] || {};
  const aliasTokens = alias[type] || [];
  const envKey =
    type === "greenhouse"
      ? "GREENHOUSE_BOARDS"
      : type === "lever"
        ? "LEVER_SITES"
        : "ASHBY_BOARDS";
  const configured = parseListEnv(envKey);
  const derived = deriveBoardTokens(companySlug);
  return [...new Set([...aliasTokens, ...configured, ...derived])];
}

async function fetchGreenhouseJobs(token) {
  const res = await fetch(`${GH_API}/${encodeURIComponent(token)}/jobs?content=false`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.jobs) ? data.jobs : [];
}

async function fetchLeverJobs(token) {
  const res = await fetch(`${LEVER_API}/${encodeURIComponent(token)}?mode=json`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchAshbyJobs(token) {
  const res = await fetch(`${ASHBY_API}/${encodeURIComponent(token)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.jobs) ? data.jobs : [];
}

function normalizeTitle(title) {
  return titleKeywords(title).join(" ");
}

function bestTitleMatch(jobs, title, urlKey = "absolute_url") {
  const norm = normalizeTitle(title);
  if (norm) {
    const exact = jobs.find((j) => normalizeTitle(j.title || j.text || "") === norm);
    if (exact) {
      const url = exact[urlKey] || exact.hostedUrl || exact.applyUrl;
      if (url) return { url, score: 1, title: exact.title, exact: true };
    }
  }

  const ranked = jobs
    .map((j) => ({
      job: j,
      score: titleMatchScore(title, j.title || j.text || ""),
    }))
    .filter((x) => x.score >= 0.45)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;

  const keywords = titleKeywords(title);
  const minScore = keywords.length <= 2 ? 0.85 : 0.45;
  if (ranked[0].score < minScore) return null;

  if (
    ranked.length > 1 &&
    ranked[1].score >= ranked[0].score - 0.05 &&
    keywords.length <= 2
  ) {
    return null;
  }

  const top = ranked[0];
  const url = top.job[urlKey] || top.job.hostedUrl || top.job.applyUrl;
  return { url, score: top.score, title: top.job.title };
}

async function searchAtsByTitle(companySlug, title) {
  for (const token of orderedTokens(companySlug, "greenhouse")) {
    const jobs = await getGreenhouseJobs(token);
    if (!jobs.length) continue;
    const match = bestTitleMatch(jobs, title);
    if (match?.url) {
      const normalized = normalizeGhUrl(match.url, token);
      if (normalized && detectAts(normalized)) {
        return {
          resolvedUrl: normalized,
          ats: detectAts(normalized),
          via: "himalayas-gh-title",
          board: token,
        };
      }
    }
  }

  for (const token of orderedTokens(companySlug, "lever")) {
    const jobs = await getLeverJobs(token);
    if (!jobs.length) continue;
    const match = bestTitleMatch(jobs, title, "hostedUrl");
    if (match?.url && detectAts(match.url)) {
      return {
        resolvedUrl: match.url,
        ats: detectAts(match.url),
        via: "himalayas-lever-title",
        board: token,
      };
    }
  }

  for (const token of orderedTokens(companySlug, "ashby")) {
    const jobs = await getAshbyJobs(token);
    if (!jobs.length) continue;
    const match = bestTitleMatch(jobs, title, "jobUrl");
    if (match?.url && detectAts(match.url)) {
      return {
        resolvedUrl: match.url,
        ats: detectAts(match.url),
        via: "himalayas-ashby-title",
        board: token,
      };
    }
  }

  return null;
}

function normalizeGhUrl(url, boardHint) {
  const trimmed = String(url || "").trim();
  if (detectAts(trimmed)) return trimmed;

  const embed = trimmed.match(/[?&]gh_jid=(\d+)/i);
  if (embed && boardHint) {
    return `https://job-boards.greenhouse.io/${boardHint}/jobs/${embed[1]}`;
  }
  return trimmed;
}

/**
 * Resolve a Himalayas aggregator URL to a Greenhouse/Lever/Ashby apply link.
 * Uses the public search API (HTML pages are Cloudflare-protected).
 */
async function resolveHimalayasApplyUrl(url) {
  const parsed = parseHimalayasUrl(url);
  if (!parsed) return null;

  const { companySlug, jobSlug } = parsed;
  let title = slugToTitle(jobSlug);

  try {
    const jobs = await fetchHimalayasCompanyJobs(companySlug);
    const job = findHimalayasJob(jobs, jobSlug);
    if (job?.title) title = job.title;

    if (job) {
      const fromDesc = pickFirstAtsUrl(job.description, job.excerpt);
      if (fromDesc && detectAts(fromDesc)) {
        return {
          resolvedUrl: fromDesc,
          ats: detectAts(fromDesc),
          via: "himalayas-api-desc",
          originalUrl: url,
        };
      }
    }

    const fromBoard = await searchAtsByTitle(companySlug, title);
    if (fromBoard) {
      return { ...fromBoard, originalUrl: url, source: "resolved" };
    }
  } catch {
    /* non-blocking */
  }

  return null;
}

module.exports = {
  parseHimalayasUrl,
  deriveBoardTokens,
  titleMatchScore,
  resolveHimalayasApplyUrl,
  KNOWN_BOARD_ALIASES,
};
