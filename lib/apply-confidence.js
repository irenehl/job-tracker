const { validateMasterProfile } = require("./profile-loader");
const { detectAts, isAtsAllowed, atsBlockerHint } = require("./ats-detect");
const { loadApplyPacket } = require("./apply-packet");
const { parseListEnv } = require("./env-utils");

function hasRedFlagsInMatchReasons(matchReasons) {
  const text = String(matchReasons || "");
  return /⚠/.test(text) || /\bred\s*flag/i.test(text);
}

function extractContactFromProfile(profileMarkdown) {
  const head = String(profileMarkdown || "")
    .split("\n")
    .slice(0, 25)
    .join("\n");

  const emailMatch = head.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  const phoneMatch = head.match(/\+?\d[\d\s().-]{8,}\d/);
  const linkedInMatch = head.match(/linkedin\.com\/[^\s)]+/i);
  const githubMatch = head.match(/github\.com\/[^\s)]+/i);

  const nameLine = profileMarkdown.split("\n").find((l) => /^#\s+/.test(l));
  const fullName = nameLine ? nameLine.replace(/^#\s+/, "").trim() : "";

  let firstName = "";
  let lastName = "";
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  return {
    fullName,
    firstName,
    lastName,
    email: emailMatch ? emailMatch[0] : "",
    phone: phoneMatch ? phoneMatch[0].trim() : "",
    linkedIn: linkedInMatch ? linkedInMatch[0] : "",
    github: githubMatch ? githubMatch[0] : "",
  };
}

function requiredFormFieldsPresent(formAnswers, preferencesMarkdown) {
  const fa = formAnswers || {};
  const prefs = String(preferencesMarkdown || "");

  const workAuth =
    String(fa.workAuthorization || fa.work_authorization || "").trim() ||
    (/\b(work\s*authorization|authorized to work|visa|citizen|green card)\b/i.test(prefs)
      ? "from-preferences"
      : "");

  const missing = [];
  if (!workAuth) missing.push("workAuthorization (form-answers or ## Preferences)");

  return { ok: missing.length === 0, missing, workAuth };
}

/**
 * Confidence gate before auto-apply. Returns { ok, blockers[], warnings[] }.
 */
function assessApplyConfidence({
  job,
  profileCtx,
  packetFolder,
  minScore = 75,
  allowedAts = ["greenhouse"],
  ats: preResolvedAts = null,
  originalApplicationUrl = null,
}) {
  const blockers = [];
  const warnings = [];

  if (job.match !== "Apply") {
    blockers.push(`Match is "${job.match || "unknown"}" (must be Apply)`);
  }

  const score = typeof job.score === "number" ? job.score : null;
  if (score === null || Number.isNaN(score)) {
    blockers.push("Score missing on Notion row");
  } else if (score < minScore) {
    blockers.push(`Score ${score} < minimum ${minScore}`);
  }

  if (hasRedFlagsInMatchReasons(job.matchReasons)) {
    blockers.push("Red flags present in match reasons");
  }

  const profileCheck = validateMasterProfile(profileCtx.profileMarkdown);
  if (!profileCheck.ok) {
    blockers.push(`Master profile invalid: ${profileCheck.errors.join("; ")}`);
  } else if (profileCheck.warnings?.length) {
    warnings.push(...profileCheck.warnings.slice(0, 3));
  }

  const contact = extractContactFromProfile(profileCtx.profileMarkdown);
  if (!contact.email) {
    blockers.push("Profile missing email in header (first ~25 lines)");
  }
  if (!contact.firstName) {
    blockers.push("Profile missing name (# heading)");
  }

  if (!packetFolder) {
    blockers.push("No packet folder on Notion row");
  } else {
    const packet = loadApplyPacket(packetFolder);
    if (!packet.ok) {
      blockers.push(packet.error);
    } else {
      const formCheck = requiredFormFieldsPresent(
        packet.formAnswers,
        profileCtx.preferencesMarkdown
      );
      if (!formCheck.ok) {
        blockers.push(...formCheck.missing.map((m) => `Missing: ${m}`));
      }
    }
  }

  const ats = preResolvedAts ?? detectAts(job.applicationUrl);
  if (!ats) {
    const displayUrl = originalApplicationUrl || job.applicationUrl || "(empty)";
    blockers.push(
      `Application URL is not a supported ATS (Greenhouse/Lever/Ashby): ${displayUrl}.${atsBlockerHint(displayUrl)}`
    );
  } else if (!isAtsAllowed(ats.type, allowedAts)) {
    blockers.push(`ATS "${ats.type}" not enabled (AUTO_APPLY_ATS)`);
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    contact,
    ats,
  };
}

module.exports = {
  assessApplyConfidence,
  extractContactFromProfile,
  hasRedFlagsInMatchReasons,
  requiredFormFieldsPresent,
};
