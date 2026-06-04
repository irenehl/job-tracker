const { completeJson } = require("./llm");
const { parseJsonFromModel } = require("./json-parse");

const SCORING_SYSTEM = `You score job postings against a candidate profile for job search prioritization.

Rules:
- Use ONLY the job text and profile/preferences provided. Do not invent candidate skills.
- Output JSON: { "score": number 0-100, "match": "Apply"|"Maybe"|"Skip", "reasons": string[], "redFlags": string[] }
- "Apply" = strong fit on role, stack, and preferences; worth applying soon.
- "Maybe" = partial fit or missing info; worth a closer look.
- "Skip" = clear mismatch, dealbreaker from preferences, or very weak fit.
- reasons: 3-6 short bullets explaining the match decision.
- redFlags: 0-4 dealbreakers or concerns (empty array if none).
- Respect dealbreakers and salary/remote/role preferences when stated in preferences.
- Respond with JSON only. No markdown fences.`;

function buildScoringUserMessage({ jobText, profileMarkdown, preferencesMarkdown, extracted }) {
  const header = extracted
    ? `Already extracted: position="${extracted.position}", company="${extracted.company}".`
    : "";

  return `${header}

---BEGIN PREFERENCES---
${preferencesMarkdown || "(No ## Preferences section — use general profile only)"}
---END PREFERENCES---

---BEGIN PROFILE (summary sections)---
${profileMarkdown.slice(0, 12000)}
---END PROFILE---

---BEGIN JOB---
${jobText.slice(0, 20000)}
---END JOB---

Score this job for the candidate.`;
}

function normalizeScoring(raw) {
  const score = Math.min(100, Math.max(0, Number(raw.score) || 0));
  let match = String(raw.match || "").trim();
  if (!["Apply", "Maybe", "Skip"].includes(match)) {
    match = score >= 70 ? "Apply" : score >= 45 ? "Maybe" : "Skip";
  }
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.map((r) => String(r).trim()).filter(Boolean)
    : [];
  const redFlags = Array.isArray(raw.redFlags)
    ? raw.redFlags.map((r) => String(r).trim()).filter(Boolean)
    : [];

  return {
    score,
    match,
    reasons,
    redFlags,
    matchReasons: formatMatchReasons(reasons, redFlags),
  };
}

function formatMatchReasons(reasons, redFlags) {
  const lines = [];
  if (reasons.length) {
    lines.push(...reasons.map((r) => `• ${r}`));
  }
  if (redFlags.length) {
    lines.push(...redFlags.map((r) => `• ⚠ ${r}`));
  }
  return lines.join("\n").slice(0, 2000);
}

async function scoreJob({ jobText, profileMarkdown, preferencesMarkdown, extracted }) {
  const modelOverride =
    process.env.LLM_JOB_MODEL ||
    (process.env.LLM_PROVIDER === "openai"
      ? process.env.OPENAI_MODEL
      : process.env.ANTHROPIC_MODEL);

  const rawText = await completeJson({
    system: SCORING_SYSTEM,
    user: buildScoringUserMessage({
      jobText,
      profileMarkdown,
      preferencesMarkdown,
      extracted,
    }),
    maxTokens: Number.parseInt(process.env.LLM_SCORE_MAX_TOKENS || "1024", 10) || 1024,
    modelOverride,
  });

  return normalizeScoring(parseJsonFromModel(rawText));
}

module.exports = {
  scoreJob,
  formatMatchReasons,
  normalizeScoring,
};
