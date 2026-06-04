#!/usr/bin/env node
/**
 * Run auto-apply once (confidence gate + ATS submit or dry-run).
 *
 *   AUTO_APPLY=1 node apply-job.js
 *   AUTO_APPLY=1 AUTO_APPLY_DRY_RUN=1 node apply-job.js --url "https://boards.greenhouse.io/..."
 */
require("dotenv").config({ path: ".env.local", override: true });

const { getProvider } = require("./lib/llm");
const { runAutoApply, applyOneJob, isAutoApplyEnabled } = require("./lib/auto-apply");
const { loadProfileContext } = require("./lib/profile-loader");
const { assessApplyConfidence } = require("./lib/apply-confidence");
const { resolveAtsUrl } = require("./lib/ats-detect");
const { findPageByUrl, pageToJobSummary } = require("./lib/notion");
const logger = require("./lib/copilot-logger");

getProvider();

async function applyFromUrl(url) {
  if (!isAutoApplyEnabled()) {
    console.error("Set AUTO_APPLY=1 in .env.local to enable auto-apply.");
    process.exit(1);
  }

  const page = await findPageByUrl(url);
  if (!page) {
    console.error(`No Notion page with Application Link: ${url}`);
    process.exit(1);
  }

  const job = pageToJobSummary(page);
  const profileCtx = loadProfileContext(
    process.env.MASTER_PROFILE_PATH || "resume/master-profile.md"
  );

  const resolved = await resolveAtsUrl(job.applicationUrl);
  const applyUrl = resolved.resolvedUrl || job.applicationUrl;
  const jobForGate =
    applyUrl !== job.applicationUrl ? { ...job, applicationUrl: applyUrl } : job;

  const gate = assessApplyConfidence({
    job: jobForGate,
    profileCtx,
    packetFolder: job.packetFolder,
    ats: resolved.ats,
    originalApplicationUrl: job.applicationUrl,
  });
  console.log("Confidence gate:", gate.ok ? "PASS" : "BLOCKED");
  if (!gate.ok) {
    gate.blockers.forEach((b) => console.log(`  ✗ ${b}`));
    process.exit(2);
  }

  const out = await applyOneJob(job, profileCtx);
  console.log(JSON.stringify(out, null, 2));
}

async function main() {
  const urlIdx = process.argv.indexOf("--url");
  if (urlIdx !== -1 && process.argv[urlIdx + 1]) {
    await applyFromUrl(process.argv[urlIdx + 1]);
    return;
  }

  const stats = await runAutoApply();
  if (!stats.enabled) {
    console.error("AUTO_APPLY is off. Set AUTO_APPLY=1 in .env.local.");
    process.exit(1);
  }
  console.log(stats);
}

main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
