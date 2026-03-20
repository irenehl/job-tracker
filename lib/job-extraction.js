const { completeJson } = require("./llm");
const { parseJsonFromModel } = require("./json-parse");

const STUDY_THEMES_MAX_TOPICS = Math.max(
  1,
  Number.parseInt(process.env.NOTION_STUDY_THEMES_MAX_TOPICS || "12", 10) || 12
);

const EXTRACTION_SYSTEM = `You extract structured data from job postings for a job tracker.

Rules:
- Use ONLY the job text the user provides. Do not invent companies or titles that are not clearly implied.
- Output a single JSON object with keys: position, company, industry, notes, studyThemes.
- "position" = job title. "company" = employer name (infer from context if shown only in headers/footer).
- "industry" = short category (e.g. Fintech, Healthcare, SaaS, E-commerce, Consulting). Infer from company and role when not spelled out.
- "notes" = 2–4 sentences: role summary, seniority, stack/skills, anything notable.
- "studyThemes" = JSON array of 8–15 short, deduplicated technical interview-prep topics, sorted by relevance to this role.
- Include only technical topics (languages, frameworks, cloud, databases, testing, architecture, CS fundamentals, system design where relevant).
- Exclude soft skills, culture fit, compensation, networking, and generic career advice.
- Never use placeholder tokens like "N/A", "Unknown", "TBD", "Not specified", or "null" unless the job text truly contains no usable hint for that field—then use your best short inference from context instead.
- Respond with JSON only. No markdown fences, no commentary.`;

function buildExtractionUserMessage(jobText) {
  return `Extract the fields as JSON.
Return up to ${STUDY_THEMES_MAX_TOPICS} studyThemes items.

---BEGIN JOB TEXT---
${jobText}
---END JOB TEXT---`;
}

function isPlaceholderValue(s) {
  const t = String(s ?? "")
    .trim()
    .toLowerCase();
  if (!t) return true;
  return /^(n\/a|n\.a\.|na|none|unknown|not specified|not applicable|tbd|n\/\s*a|\?|—|-+)$/.test(
    t
  );
}

function normalizeStudyThemes(rawValue) {
  const values = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === "string"
      ? rawValue.split(/[\n,;]+/)
      : [];
  const normalized = [];
  const seen = new Set();

  for (const value of values) {
    const cleaned = String(value ?? "")
      .replace(/^\s*[-*•\d.)]+\s*/, "")
      .trim();
    if (!cleaned || isPlaceholderValue(cleaned)) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
    if (normalized.length >= STUDY_THEMES_MAX_TOPICS) break;
  }

  return normalized;
}

function normalizeExtractedData(raw) {
  const out = {};
  const keys = ["position", "company", "industry", "notes"];
  for (const k of keys) {
    out[k] = String(raw[k] ?? "").trim();
  }
  out.studyThemes = normalizeStudyThemes(raw.studyThemes);
  return out;
}

function assertMeaningfulExtraction(data, jobText) {
  const bad =
    isPlaceholderValue(data.position) &&
    isPlaceholderValue(data.company) &&
    isPlaceholderValue(data.industry) &&
    isPlaceholderValue(data.notes);
  if (!bad) return;

  const preview = jobText.replace(/\s+/g, " ").trim().slice(0, 280);
  throw new Error(
    `Extraction returned no usable fields (everything looked like N/A/empty).\n\n` +
      `Common causes:\n` +
      `  • Clipboard was empty or not the job post (run: pbpaste | head -c 400)\n` +
      `  • Pasted content is only UI chrome / login page / image, not job text\n\n` +
      `Input preview (${jobText.length} chars): ${preview || "(empty)"}`
  );
}

function formatStudyThemesForNotion(studyThemes) {
  return studyThemes.map((topic) => `• ${topic}`).join("\n");
}

async function extractJobData(jobText) {
  const userContent = buildExtractionUserMessage(jobText);
  const modelOverride =
    process.env.LLM_JOB_MODEL ||
    (process.env.LLM_PROVIDER === "openai"
      ? process.env.OPENAI_MODEL
      : process.env.ANTHROPIC_MODEL);

  const rawText = await completeJson({
    system: EXTRACTION_SYSTEM,
    user: userContent,
    maxTokens: Number.parseInt(process.env.LLM_JOB_MAX_TOKENS || "1536", 10) || 1536,
    modelOverride,
  });

  if (process.env.TRACK_JOB_DEBUG === "1") {
    console.error("[track-job debug] Raw model JSON text:\n", rawText, "\n");
  }

  const parsed = normalizeExtractedData(parseJsonFromModel(rawText));
  assertMeaningfulExtraction(parsed, jobText);
  return parsed;
}

module.exports = {
  extractJobData,
  formatStudyThemesForNotion,
  normalizeExtractedData,
  isPlaceholderValue,
};
