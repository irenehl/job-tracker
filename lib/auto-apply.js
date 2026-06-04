const path = require("path");
const { loadProfileContext, validateMasterProfile } = require("./profile-loader");
const { assessApplyConfidence } = require("./apply-confidence");
const { loadApplyPacket } = require("./apply-packet");
const { detectAts, resolveAtsUrl } = require("./ats-detect");
const { submitGreenhouseApply } = require("./apply/greenhouse-apply");
const { queryJobsReadyToApply, upsertJobPage } = require("./notion");
const { parseBoolEnv, parseIntEnv, parseListEnv } = require("./env-utils");
const logger = require("./copilot-logger");

function isAutoApplyEnabled() {
  return parseBoolEnv("AUTO_APPLY", false);
}

function isDryRun() {
  if (parseBoolEnv("AUTO_APPLY_DRY_RUN", true)) return true;
  return !parseBoolEnv("AUTO_APPLY_LIVE", false);
}

async function applyOneJob(job, profileCtx, options = {}) {
  const minScore = options.minScore ?? parseIntEnv("AUTO_APPLY_MIN_SCORE", 75);
  const allowedAts = options.allowedAts ?? parseListEnv("AUTO_APPLY_ATS");
  const dryRun = options.dryRun ?? isDryRun();

  const resolved = await resolveAtsUrl(job.applicationUrl);
  const applyUrl = resolved.resolvedUrl || job.applicationUrl;
  const jobForApply =
    applyUrl !== job.applicationUrl ? { ...job, applicationUrl: applyUrl } : job;

  if (resolved.followedRedirect && resolved.ats) {
    logger.info(
      `Resolved ATS URL: ${job.applicationUrl} → ${applyUrl} (${resolved.ats.type})`
    );
  }

  const gate = assessApplyConfidence({
    job: jobForApply,
    profileCtx,
    packetFolder: job.packetFolder,
    minScore,
    allowedAts: allowedAts.length ? allowedAts : ["greenhouse"],
    ats: resolved.ats,
    originalApplicationUrl: job.applicationUrl,
  });

  if (!gate.ok) {
    logger.warn(
      `Apply blocked ${job.company} — ${job.position}: ${gate.blockers.join("; ")}`
    );
    return { status: "blocked", blockers: gate.blockers, warnings: gate.warnings };
  }

  const packet = loadApplyPacket(job.packetFolder);
  const ats = gate.ats || detectAts(applyUrl);
  const logPrefix = dryRun ? "[dry-run]" : "[live]";

  logger.info(
    `${logPrefix} Apply ${ats.type}: ${job.company} — ${job.position} (${applyUrl})`
  );
  gate.warnings.forEach((w) => logger.warn(`  profile: ${w}`));

  let result;
  if (ats.type === "greenhouse") {
    result = await submitGreenhouseApply({
      applicationUrl: applyUrl,
      contact: gate.contact,
      packet,
      formAnswers: packet.formAnswers,
      dryRun,
    });
  } else {
    result = {
      ok: false,
      skipped: true,
      reason: `${ats.type} live apply not implemented in Phase 1 (dry-run only)`,
      plan: { ats: ats.type, url: applyUrl },
    };
  }

  const applyLog = {
    ats: ats.type,
    dryRun,
    ok: result.ok,
    submitted: result.submitted,
    skipped: result.skipped,
    reason: result.reason || result.message,
    plan: result.plan,
  };

  logger.info(
    `${logPrefix} Result: ${result.ok ? "ok" : "fail"} — ${result.reason || result.message || "done"}`
  );

  if (result.submitted && !dryRun) {
    const today = new Date().toISOString().split("T")[0];
    await upsertJobPage({
      position: job.position,
      company: job.company,
      notes: job.notes,
      applicationUrl: job.applicationUrl,
      applicationStatus: process.env.NOTION_STATUS_APPLIED || "Applied",
      appliedDate: today,
      score: job.score,
      match: job.match,
      matchReasons: job.matchReasons,
      packetFolder: job.packetFolder,
    });
    logger.info(`Notion → Applied: ${job.position} @ ${job.company}`);
  }

  return {
    status: result.submitted ? "submitted" : result.skipped ? "skipped" : dryRun && result.ok ? "dry_run" : "failed",
    applyLog,
    result,
  };
}

async function runAutoApply() {
  if (!isAutoApplyEnabled()) {
    logger.info("AUTO_APPLY=0 — auto-apply disabled");
    return { enabled: false, queued: 0, applied: 0, dryRun: 0, blocked: 0, skipped: 0, errors: 0 };
  }

  const profilePath =
    process.env.MASTER_PROFILE_PATH || path.join("resume", "master-profile.md");
  const profileCtx = loadProfileContext(profilePath);
  const check = validateMasterProfile(profileCtx.profileMarkdown);
  if (!check.ok) {
    throw new Error(`Master profile invalid: ${check.errors.join("; ")}`);
  }

  const minScore = parseIntEnv("AUTO_APPLY_MIN_SCORE", 75);
  const limit = parseIntEnv("AUTO_APPLY_BATCH", 2);
  const dryRun = isDryRun();

  if (dryRun) {
    logger.info("AUTO_APPLY dry-run mode (set AUTO_APPLY_DRY_RUN=0 and AUTO_APPLY_LIVE=1 to submit)");
  } else {
    logger.warn("AUTO_APPLY LIVE — submissions will be sent to ATS");
  }

  const jobs = await queryJobsReadyToApply({ minScore, limit });
  if (jobs.length === 0) {
    const { queryJobsNeedingPacket } = require("./notion");
    const needPacket = await queryJobsNeedingPacket({ minScore, limit: 3 });
    if (needPacket.length > 0) {
      logger.info(
        `Apply queue empty — ${needPacket.length} job(s) need auto-packet first (run npm run packet:once — faster than full copilot:once). ` +
          `Example: ${needPacket[0].company} — ${needPacket[0].position}`
      );
    } else {
      logger.info(
        "Apply queue empty — no rows with Match=Apply, score>=" +
          minScore +
          ", status=" +
          (process.env.NOTION_STATUS_PACKET_READY || "In progress") +
          ", and packet folder. Ingest + score jobs, then run copilot:once."
      );
    }
  }
  const stats = {
    enabled: true,
    dryRun,
    queued: jobs.length,
    applied: 0,
    dryRunOk: 0,
    blocked: 0,
    skipped: 0,
    errors: 0,
  };

  for (const job of jobs) {
    try {
      const out = await applyOneJob(job, profileCtx, { minScore, dryRun });
      if (out.status === "submitted") stats.applied++;
      else if (out.status === "dry_run") stats.dryRunOk++;
      else if (out.status === "blocked") stats.blocked++;
      else if (out.status === "skipped") stats.skipped++;
      else stats.errors++;
    } catch (err) {
      stats.errors++;
      logger.error(`Apply error ${job.position}: ${err.message}`);
    }
  }

  logger.info(
    `Auto-apply done: queued=${stats.queued} submitted=${stats.applied} dry_run_ok=${stats.dryRunOk} blocked=${stats.blocked} skipped=${stats.skipped} errors=${stats.errors}`
  );

  return stats;
}

module.exports = {
  runAutoApply,
  applyOneJob,
  isAutoApplyEnabled,
  isDryRun,
};
