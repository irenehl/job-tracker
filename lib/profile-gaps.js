const { completeJson } = require("./llm");
const { parseJsonFromModel } = require("./json-parse");

const GAP_SYSTEM = `You compare a job description to a candidate's master profile (Markdown).

## Rules
1. **Never** suggest inventing employers, titles, dates, skills, or metrics. Frame every item as: if the candidate truly has this, they should add it to the master profile.
2. **jobAsksNotInProfile**: Short phrases for concrete requirements, tools, or responsibilities in the job that are **not** clearly evidenced in the profile text.
3. **suggestedProfileQuestions**: Specific questions the candidate could answer to improve honest overlap with this job (e.g. "If you used Redis at Agora, add a bullet naming it and the outcome").
4. **metricsToCaptureIfTrue**: Reminders like "If you know p95 latency or team size for role X, add it to the profile" — never imply fabricating numbers.

## Output
Return one JSON object with exactly these keys:
- "jobAsksNotInProfile": array of strings
- "suggestedProfileQuestions": array of strings
- "metricsToCaptureIfTrue": array of strings

**JSON only.** No markdown fences, no commentary outside the JSON.`;

function buildGapUserMessage({ jobText, profileMarkdown, extracted }) {
  const meta = extracted
    ? `Extracted job metadata (hints only; job text is source of truth):\n${JSON.stringify(
        {
          position: extracted.position,
          company: extracted.company,
          industry: extracted.industry,
          notes: extracted.notes,
        },
        null,
        2
      )}\n\n`
    : "";

  return `${meta}---BEGIN JOB DESCRIPTION---
${jobText}
---END JOB DESCRIPTION---

---BEGIN MASTER PROFILE---
${profileMarkdown}
---END MASTER PROFILE---

Return the JSON object as specified.`;
}

function normalizeStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter((s) => s.length > 0);
}

function normalizeGapResult(raw) {
  return {
    jobAsksNotInProfile: normalizeStringArray(raw.jobAsksNotInProfile),
    suggestedProfileQuestions: normalizeStringArray(raw.suggestedProfileQuestions),
    metricsToCaptureIfTrue: normalizeStringArray(raw.metricsToCaptureIfTrue),
  };
}

async function suggestProfileGaps({ jobText, profileMarkdown, extracted }) {
  const modelOverride =
    process.env.LLM_JOB_MODEL ||
    (process.env.LLM_PROVIDER === "openai"
      ? process.env.OPENAI_MODEL
      : process.env.ANTHROPIC_MODEL);

  const rawText = await completeJson({
    system: GAP_SYSTEM,
    user: buildGapUserMessage({ jobText, profileMarkdown, extracted }),
    maxTokens: 1024,
    modelOverride,
  });

  if (process.env.TRACK_JOB_DEBUG === "1") {
    console.error("[profile-gaps debug] Raw model JSON text:\n", rawText, "\n");
  }

  const parsed = parseJsonFromModel(rawText);
  return normalizeGapResult(parsed);
}

module.exports = { suggestProfileGaps };
