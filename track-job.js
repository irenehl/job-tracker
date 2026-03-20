// Use .env.local values even if API keys are already set in the shell
require("dotenv").config({ path: ".env.local", override: true });

const path = require("path");
const { getProvider } = require("./lib/llm");
const { extractJobData } = require("./lib/job-extraction");
const { readStdin, ask, isAffirmative } = require("./lib/cli-prompts");
const { saveToNotion } = require("./lib/notion");
const { loadMasterProfile, validateMasterProfile } = require("./lib/profile-loader");
const { suggestProfileGaps } = require("./lib/profile-gaps");
const { tailorResume, reviseTailoredResume } = require("./lib/resume-tailor");
const {
  validateTailoredResume,
  formatValidationForLLM,
  shouldFailStrict,
} = require("./lib/resume-validator");
const { writeTailoredResumeArtifacts } = require("./lib/resume-export");
const { buildOutputSubdir } = require("./lib/path-utils");
const {
  red,
  yellow,
  green,
  cyan,
  dim,
  magenta,
  sectionHeader,
  formatQualityScoresLine,
} = require("./lib/terminal-style");

getProvider();

function getGenerateResumeMode() {
  const v = (process.env.GENERATE_RESUME || "prompt").trim().toLowerCase();
  if (v === "1" || v === "yes" || v === "always" || v === "y") return "always";
  if (v === "0" || v === "no" || v === "never" || v === "n") return "never";
  return "prompt";
}

function getResumeAutoRevise() {
  const v = (process.env.RESUME_AUTO_REVISE || "1").trim().toLowerCase();
  return v !== "0" && v !== "no" && v !== "false" && v !== "never";
}

function getProfileGapCheckMode() {
  const v = (process.env.PROFILE_GAP_CHECK || "prompt").trim().toLowerCase();
  if (v === "1" || v === "yes" || v === "always" || v === "y") return "always";
  if (v === "0" || v === "no" || v === "never" || v === "n") return "never";
  return "prompt";
}

function printMasterProfileWarnings(warnings) {
  if (!warnings.length) return;
  console.log(yellow("Master profile suggestions (non-blocking):"));
  warnings.forEach((w) => console.log(`  • ${w}`));
  console.log();
}

function printProfileGapsReport(gaps, profileAbsolutePath) {
  console.log(
    sectionHeader("--- Profile gap analysis (add to master profile only if true) ---") + "\n"
  );
  console.log(dim("(Nothing to type here; update your master profile in an editor if needed.)\n"));

  if (gaps.jobAsksNotInProfile.length) {
    console.log("Job asks for (not clearly in profile yet):");
    gaps.jobAsksNotInProfile.forEach((g) => console.log(`  • ${g}`));
    console.log();
  }

  if (gaps.suggestedProfileQuestions.length) {
    console.log("Questions to strengthen your profile for this job:");
    gaps.suggestedProfileQuestions.forEach((q, i) => {
      console.log(`  ${i + 1}. ${q}`);
    });
    console.log();
  }

  if (gaps.metricsToCaptureIfTrue.length) {
    console.log("Metrics (only add real numbers to the profile):");
    gaps.metricsToCaptureIfTrue.forEach((m) => console.log(`  • ${m}`));
    console.log();
  }

  if (
    !gaps.jobAsksNotInProfile.length &&
    !gaps.suggestedProfileQuestions.length &&
    !gaps.metricsToCaptureIfTrue.length
  ) {
    console.log("(No gaps listed by the model.)\n");
  }

  console.log(sectionHeader("--- End profile gap analysis ---") + "\n");
  console.log(
    `Update (if applicable) in your editor: ${cyan(profileAbsolutePath)}\n` +
      "Then: press Enter (or y / yes) to tailor with your profile as it is now, or n to stop, edit the file, and run this command again for a better-grounded resume.\n"
  );
}

function printValidationReport(validation, label) {
  const { scores, severity, warnings, errors, blocking, aiToneFlags } = validation;
  console.log(formatQualityScoresLine(label, scores, severity));

  if (blocking.length) {
    console.log(red("Blocking issues:"));
    blocking.forEach((b) => console.log(`  • ${b}`));
    console.log();
  }
  if (errors.length) {
    console.log(red("Errors:"));
    errors.forEach((e) => console.log(`  • ${e}`));
    console.log();
  }
  if (aiToneFlags.length) {
    console.log(magenta("Tone / phrasing flags (review):"));
    aiToneFlags.forEach((f) => console.log(`  • ${f}`));
    console.log();
  }
  if (warnings.length) {
    console.log(yellow("Validation warnings:"));
    warnings.forEach((w) => console.log(`  • ${w}`));
    console.log();
  }
}

async function maybeGenerateResume(jobText, extracted) {
  const mode = getGenerateResumeMode();
  let want = false;
  if (mode === "always") want = true;
  else if (mode === "never") want = false;
  else {
    const a = await ask("Generate tailored resume (Markdown + DOCX)? [Y/n] ");
    want = isAffirmative(a);
  }

  if (!want) {
    console.log("(Resume generation skipped.)");
    return;
  }

  const profilePath =
    process.env.MASTER_PROFILE_PATH || path.join("resume", "master-profile.md");
  const { raw: profileMarkdown, absolutePath } = loadMasterProfile(profilePath);

  const profileCheck = validateMasterProfile(profileMarkdown);
  if (!profileCheck.ok) {
    console.error(red("Master profile validation failed:"));
    profileCheck.errors.forEach((e) => console.error(`  • ${e}`));
    throw new Error(`Edit your profile file and try again: ${absolutePath}`);
  }

  printMasterProfileWarnings(profileCheck.warnings);

  const gapMode = getProfileGapCheckMode();
  let runGapLlm = false;
  if (gapMode === "always") runGapLlm = true;
  else if (gapMode === "never") runGapLlm = false;
  else {
    const g = await ask("Print profile gap questions for this job? [Y/n] ");
    runGapLlm = isAffirmative(g);
  }

  if (runGapLlm) {
    console.log("\nAnalyzing profile gaps for this job...\n");
    const gaps = await suggestProfileGaps({
      jobText,
      profileMarkdown,
      extracted,
    });
    printProfileGapsReport(gaps, absolutePath);
    const cont = await ask("Continue with tailoring? [Y/n] ");
    if (!isAffirmative(cont)) {
      console.log("(Tailoring skipped after profile gap analysis.)");
      return;
    }
  }

  console.log("\nTailoring resume for this role...\n");
  let tailored = await tailorResume({
    jobText,
    profileMarkdown,
    extracted,
  });

  let validation = validateTailoredResume(tailored, profileMarkdown, jobText);
  printValidationReport(validation, "");

  if (validation.severity === "fail") {
    throw new Error(
      "Resume validation failed (grounding/format). Fix your master profile, remove unsupported metrics, or tighten claims — see messages above."
    );
  }

  if (getResumeAutoRevise() && validation.reviseRecommended) {
    console.log("Running one revision pass from validation feedback...\n");
    tailored = await reviseTailoredResume({
      jobText,
      profileMarkdown,
      extracted,
      previousTailored: tailored,
      validationFeedbackJson: formatValidationForLLM(validation),
    });
    validation = validateTailoredResume(tailored, profileMarkdown, jobText);
    printValidationReport(validation, "After revision — ");
  }

  const strict = process.env.RESUME_STRICT === "1";
  if (strict && shouldFailStrict(validation, { afterRevision: true })) {
    throw new Error(
      "RESUME_STRICT=1: resume still has tone/grounding/relevance issues after validation (and optional revision). Improve your master profile or unset RESUME_STRICT."
    );
  }

  const outDir = buildOutputSubdir({
    company: extracted.company || "company",
    position: extracted.position || "role",
    outputRoot: path.resolve(
      process.cwd(),
      process.env.RESUME_OUTPUT_DIR || "output"
    ),
  });

  const { mdPath, docxPath } = await writeTailoredResumeArtifacts(
    tailored,
    outDir,
    { profileMarkdown }
  );
  console.log(green("Wrote tailored resume:"));
  console.log(`  ${cyan(mdPath)}`);
  console.log(`  ${cyan(docxPath)}`);
}

async function main() {
  let jobText = process.argv[2];

  if (!jobText) {
    if (process.stdin.isTTY) {
      console.error(
        red(
          "Usage: node track-job.js \"job text\" OR pbpaste | node track-job.js"
        )
      );
      process.exit(1);
    }
    jobText = await readStdin();
  }

  if (!jobText) {
    console.error(red("No job description provided."));
    process.exit(1);
  }

  if (jobText.length < 40) {
    console.warn(
      `${yellow("Warning:")} input is very short (${jobText.length} chars). If fields look wrong, check the clipboard (pbpaste | wc -c).\n`
    );
  }

  console.log("\nExtracting job data...\n");
  const data = await extractJobData(jobText);

  console.log("Position: ", data.position);
  console.log("Company:  ", data.company);
  console.log("Industry: ", data.industry);
  console.log("Notes:    ", data.notes);
  console.log("Study themes:");
  if (data.studyThemes.length === 0) {
    console.log("  (none suggested)");
  } else {
    data.studyThemes.forEach((topic, index) => {
      console.log(`  ${index + 1}. ${topic}`);
    });
  }
  console.log();

  const answer = await ask("Save to Notion? [Y/n] ");

  if (isAffirmative(answer)) {
    const pageId = await saveToNotion(data);
    console.log(`\n${green("Saved to Notion.")} ${cyan("Page ID:")} ${cyan(pageId)}`);
  } else {
    console.log("Skipped Notion save.");
  }

  await maybeGenerateResume(jobText, data);
}

main().catch((err) => {
  console.error(`${red("Error:")} ${err.message}`);
  process.exit(1);
});
