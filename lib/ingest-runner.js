const path = require("path");
const { extractJobData } = require("./job-extraction");
const { scoreJob } = require("./job-scoring");
const { loadProfileContext } = require("./profile-loader");
const { parseListEnv, parseIntEnv } = require("./env-utils");
const { fetchGreenhouseJobs } = require("./connectors/greenhouse");
const { fetchLeverJobs } = require("./connectors/lever");
const { fetchAshbyJobs } = require("./connectors/ashby");
const { fetchHimalayasJobs } = require("./connectors/himalayas");
const { fetchRemoteOkJobs } = require("./connectors/remoteok");
const { fetchScrapedJobs } = require("./connectors/scrape-feeds");
const { detectAts } = require("./ats-detect");
const {
  resolveApplyUrl,
  isResolveEnabled,
  inferAggregatorLabel,
} = require("./resolve-apply-url");
const { findPageByUrl, upsertJobPage, isNotionConfigured } = require("./notion");
const logger = require("./copilot-logger");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function inferSearchQuery(profileCtx) {
  if (process.env.HIMALAYAS_SEARCH_QUERY) {
    return process.env.HIMALAYAS_SEARCH_QUERY.trim();
  }
  const prefs = profileCtx?.preferencesMarkdown || "";
  const m = prefs.match(/target\s*roles?\s*:\s*(.+)/i);
  if (m) return m[1].split(",")[0].trim();
  return "software engineer remote";
}

async function collectAllJobs(boardFilter = null, profileCtx = null) {
  const jobs = [];
  const max = parseIntEnv("INGEST_MAX_JOBS", 50);

  for (const src of buildSourceHandlers(boardFilter, jobs)) {
    // jobs array mutated by handlers via push()
    if (!src.enabled()) continue;
    try {
      await src.fetch(profileCtx);
    } catch (err) {
      logger.error(`${src.name}: ${err.message}`);
    }
  }

  return jobs.slice(0, max);
}

function buildSourceHandlers(boardFilter, jobs) {
  const perSource = parseIntEnv("INGEST_PER_SOURCE", 25);

  const push = (list) => jobs.push(...list);

  return [
    {
      name: "greenhouse",
      enabled: () => parseListEnv("GREENHOUSE_BOARDS").length > 0,
      fetch: async () => {
        for (const token of parseListEnv("GREENHOUSE_BOARDS")) {
          if (boardFilter && token.toLowerCase() !== boardFilter) continue;
          logger.info(`Fetch Greenhouse: ${token}`);
          push(await fetchGreenhouseJobs(token));
        }
      },
    },
    {
      name: "lever",
      enabled: () => parseListEnv("LEVER_SITES").length > 0,
      fetch: async () => {
        for (const site of parseListEnv("LEVER_SITES")) {
          if (boardFilter && site.toLowerCase() !== boardFilter) continue;
          logger.info(`Fetch Lever: ${site}`);
          push(await fetchLeverJobs(site));
        }
      },
    },
    {
      name: "ashby",
      enabled: () => parseListEnv("ASHBY_BOARDS").length > 0,
      fetch: async () => {
        for (const board of parseListEnv("ASHBY_BOARDS")) {
          if (boardFilter && board.toLowerCase() !== boardFilter) continue;
          logger.info(`Fetch Ashby: ${board}`);
          push(await fetchAshbyJobs(board));
        }
      },
    },
    {
      name: "himalayas",
      enabled: () => process.env.HIMALAYAS_ENABLED !== "0",
      fetch: async (profileCtx) => {
        const q = inferSearchQuery(profileCtx);
        logger.info(`Fetch Himalayas: q="${q}"`);
        const pages = parseIntEnv("HIMALAYAS_PAGES", 2);
        for (let page = 1; page <= pages; page++) {
          push(await fetchHimalayasJobs({ query: q, limit: perSource, page }));
        }
      },
    },
    {
      name: "remoteok",
      enabled: () => process.env.REMOTEOK_ENABLED !== "0",
      fetch: async () => {
        logger.info("Fetch RemoteOK");
        push(await fetchRemoteOkJobs(perSource));
      },
    },
    {
      name: "scrape",
      enabled: () =>
        parseListEnv("RSS_URLS").length > 0 || parseListEnv("SCRAPE_URLS").length > 0,
      fetch: async () => {
        logger.info("Fetch RSS / scrape URLs");
        push(await fetchScrapedJobs());
      },
    },
  ];
}

async function processJob(job, profileCtx) {
  const delayMs = parseIntEnv("INGEST_LLM_DELAY_MS", 300);

  if (!job.url) {
    return { skipped: true, reason: "no url" };
  }

  const existing = await findPageByUrl(job.url);
  if (existing) {
    return { skipped: true, reason: "already in Notion" };
  }

  const jobText = job.jobText || job.description || "";
  if (jobText.length < 80) {
    return { skipped: true, reason: "description too short" };
  }

  const extracted = await extractJobData(jobText);
  if (!extracted.company && job.company) extracted.company = job.company;
  if (!extracted.position && job.title) extracted.position = job.title;

  await sleep(delayMs);

  const scoring = await scoreJob({
    jobText,
    profileMarkdown: profileCtx.profileMarkdown,
    preferencesMarkdown: profileCtx.preferencesMarkdown,
    extracted,
  });

  const minScore = parseIntEnv("INGEST_MIN_SCORE", 0);
  if (scoring.score < minScore) {
    return { skipped: true, reason: `score ${scoring.score} < ${minScore}` };
  }

  let applicationUrl = job.url;
  if (!detectAts(applicationUrl) && isResolveEnabled()) {
    try {
      const resolved = await resolveApplyUrl(applicationUrl, {
        description: job.description || job.jobText,
        source: job.source,
      });
      if (resolved?.source === "resolved" && resolved.resolvedUrl) {
        const label = inferAggregatorLabel(applicationUrl, job.source);
        logger.info(
          `Resolved ATS URL: ${label} → ${resolved.ats?.type || "ats"}`
        );
        applicationUrl = resolved.resolvedUrl;
      }
    } catch (err) {
      logger.warn(`ATS URL resolve failed for ${applicationUrl}: ${err.message}`);
    }
  }

  const notes = [
    extracted.notes,
    job.location ? `Location: ${job.location}` : "",
    job.remote ? "Remote: yes" : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { pageId, created } = await upsertJobPage({
    position: extracted.position,
    company: extracted.company,
    industry: extracted.industry,
    notes,
    studyThemes: extracted.studyThemes,
    applicationUrl,
    source: job.source,
    score: scoring.score,
    match: scoring.match,
    matchReasons: scoring.matchReasons,
    applicationStatus:
      scoring.match === "Skip"
        ? process.env.NOTION_STATUS_SKIP || "Skip"
        : process.env.NOTION_STATUS_DISCOVERED || "Not applied",
  });

  return {
    skipped: false,
    created,
    pageId,
    title: extracted.position,
    company: extracted.company,
    match: scoring.match,
    score: scoring.score,
    jobText,
    extracted,
    applicationUrl,
  };
}

async function runIngest({ boardFilter = null, onHighMatch } = {}) {
  if (!isNotionConfigured()) {
    throw new Error("Notion not configured (NOTION_API_KEY, NOTION_DATABASE_ID)");
  }

  const profilePath =
    process.env.MASTER_PROFILE_PATH || path.join("resume", "master-profile.md");
  const profileCtx = loadProfileContext(profilePath);

  const jobs = await collectAllJobs(boardFilter, profileCtx);
  const stats = { found: jobs.length, created: 0, skipped: 0, errors: 0, highMatches: [] };

  if (!jobs.length) {
    logger.warn("No jobs collected — check GREENHOUSE_BOARDS, HIMALAYAS, RSS_URLS, etc.");
    return stats;
  }

  logger.info(`Processing ${jobs.length} job(s)...`);

  for (const job of jobs) {
    try {
      const result = await processJob(job, profileCtx);
      if (result.skipped) {
        stats.skipped++;
        continue;
      }
      if (result.created) stats.created++;
      logger.info(
        `[${result.match} ${result.score}] ${result.company} — ${result.title}`
      );

      const minAuto = parseIntEnv("AUTO_PACKET_MIN_SCORE", 75);
      if (
        result.match === "Apply" &&
        result.score >= minAuto &&
        typeof onHighMatch === "function"
      ) {
        stats.highMatches.push(result);
        await onHighMatch(result);
      }
    } catch (err) {
      stats.errors++;
      logger.error(`${job.title || job.url}: ${err.message}`);
    }
  }

  logger.info(
    `Ingest done: ${stats.created} new, ${stats.skipped} skipped, ${stats.errors} errors`
  );
  return stats;
}

function hasAnyIngestSource() {
  return (
    parseListEnv("GREENHOUSE_BOARDS").length > 0 ||
    parseListEnv("LEVER_SITES").length > 0 ||
    parseListEnv("ASHBY_BOARDS").length > 0 ||
    parseListEnv("RSS_URLS").length > 0 ||
    parseListEnv("SCRAPE_URLS").length > 0 ||
    process.env.HIMALAYAS_ENABLED !== "0" ||
    process.env.REMOTEOK_ENABLED !== "0"
  );
}

module.exports = {
  runIngest,
  collectAllJobs,
  processJob,
  hasAnyIngestSource,
};
