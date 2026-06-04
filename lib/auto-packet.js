const fs = require("fs");
const path = require("path");
const { fetchJobFromUrl } = require("./fetch-job-url");
const { tailorResume, reviseTailoredResume } = require("./resume-tailor");
const {
  validateTailoredResume,
  formatValidationForLLM,
  shouldFailStrict,
} = require("./resume-validator");
const { writeTailoredResumeArtifacts } = require("./resume-export");
const { buildOutputSubdir } = require("./path-utils");
const {
  generateCoverLetter,
  generateWhyFit,
  generateFormAnswers,
  writeApplicationPacketFiles,
} = require("./cover-letter");
const { loadProfileContext, validateMasterProfile } = require("./profile-loader");
const { upsertJobPage, queryJobsNeedingPacket } = require("./notion");
const { parseIntEnv, parseBoolEnv } = require("./env-utils");
const logger = require("./copilot-logger");

async function resolveJobText(applicationUrl, fallbackNotes) {
  if (applicationUrl) {
    try {
      const { jobText } = await fetchJobFromUrl(applicationUrl);
      if (jobText.length >= 80) return jobText;
    } catch {
      /* fall through */
    }
  }
  return fallbackNotes || "";
}

async function buildPacketForJob({
  jobText,
  extracted,
  profileCtx,
}) {
  const { profileMarkdown, preferencesMarkdown } = profileCtx;

  let tailored = await tailorResume({
    jobText,
    profileMarkdown,
    extracted,
  });

  let validation = validateTailoredResume(tailored, profileMarkdown, jobText);

  if (
    parseBoolEnv("RESUME_AUTO_REVISE", true) &&
    validation.reviseRecommended
  ) {
    tailored = await reviseTailoredResume({
      jobText,
      profileMarkdown,
      extracted,
      previousTailored: tailored,
      validationFeedbackJson: formatValidationForLLM(validation),
    });
    validation = validateTailoredResume(tailored, profileMarkdown, jobText);
  }

  if (validation.severity === "fail") {
    throw new Error("Resume validation failed — needs manual review");
  }

  if (parseBoolEnv("RESUME_STRICT", false) && shouldFailStrict(validation, { afterRevision: true })) {
    throw new Error("RESUME_STRICT: validation failed");
  }

  const outDir = buildOutputSubdir({
    company: extracted.company || "company",
    position: extracted.position || "role",
    outputRoot: path.resolve(
      process.cwd(),
      process.env.RESUME_OUTPUT_DIR || "output"
    ),
  });

  await writeTailoredResumeArtifacts(tailored, outDir, { profileMarkdown });

  const [coverLetter, whyFit, formAnswers] = await Promise.all([
    generateCoverLetter({
      jobText,
      profileMarkdown,
      preferencesMarkdown,
      extracted,
    }),
    generateWhyFit({ jobText, profileMarkdown, extracted }),
    generateFormAnswers({ jobText, profileMarkdown, preferencesMarkdown }),
  ]);

  await writeApplicationPacketFiles(outDir, {
    coverLetter,
    whyFit,
    formAnswers,
  });

  return outDir;
}

async function autoPacketFromIngestResult(result, profileCtx) {
  return buildPacketForJob({
    jobText: result.jobText,
    extracted: result.extracted,
    profileCtx,
  });
}

async function runAutoPacket() {
  const profilePath =
    process.env.MASTER_PROFILE_PATH || path.join("resume", "master-profile.md");
  const profileCtx = loadProfileContext(profilePath);
  const check = validateMasterProfile(profileCtx.profileMarkdown);
  if (!check.ok) {
    throw new Error(`Master profile invalid: ${check.errors.join("; ")}`);
  }

  const minScore = parseIntEnv("AUTO_PACKET_MIN_SCORE", 75);
  const limit = parseIntEnv("AUTO_PACKET_BATCH", 3);
  const jobs = await queryJobsNeedingPacket({ minScore, limit });

  const stats = { queued: jobs.length, built: 0, errors: 0 };

  for (const job of jobs) {
    try {
      logger.info(`Auto-packet: ${job.company} — ${job.position}`);
      const jobText = await resolveJobText(job.applicationUrl, job.notes);
      if (jobText.length < 80) {
        logger.warn(`Skip packet (short text): ${job.position}`);
        continue;
      }

      const extracted = {
        position: job.position,
        company: job.company,
        industry: "",
        notes: job.notes,
        studyThemes: [],
      };

      const outDir = await buildPacketForJob({
        jobText,
        extracted,
        profileCtx,
      });

      await upsertJobPage({
        position: job.position,
        company: job.company,
        notes: job.notes,
        applicationUrl: job.applicationUrl,
        applicationStatus: process.env.NOTION_STATUS_PACKET_READY || "In progress",
        packetFolder: outDir,
        score: job.score,
        match: job.match,
      });

      stats.built++;
      logger.info(`Packet ready: ${outDir}`);
    } catch (err) {
      stats.errors++;
      logger.error(`Packet failed ${job.position}: ${err.message}`);
    }
  }

  return stats;
}

module.exports = {
  runAutoPacket,
  autoPacketFromIngestResult,
  buildPacketForJob,
};
