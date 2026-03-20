const { completeJson } = require("./llm");
const { parseJsonFromModel } = require("./json-parse");

function getOptionalFloatEnv(name) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return undefined;
  const n = Number.parseFloat(String(raw).trim());
  if (Number.isNaN(n)) return undefined;
  return n;
}

function getTailorJsonMaxRetries() {
  const n = Number.parseInt(process.env.TAILOR_JSON_MAX_RETRIES || "2", 10);
  if (Number.isNaN(n) || n < 0) return 2;
  return Math.min(n, 5);
}

async function completeAndParseResumeJson(completeOpts, debugLabel) {
  const maxAttempts = getTailorJsonMaxRetries() + 1;
  let lastParseErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const rawText = await completeJson(completeOpts);
    if (process.env.TRACK_JOB_DEBUG === "1") {
      console.error(
        `[resume-tailor ${debugLabel} debug] attempt ${attempt}/${maxAttempts} raw JSON text:\n`,
        rawText,
        "\n"
      );
    }
    try {
      return parseJsonFromModel(rawText);
    } catch (e) {
      lastParseErr = e;
      if (attempt === maxAttempts) {
        throw new Error(
          `Resume ${debugLabel}: JSON parse failed after ${maxAttempts} attempt(s): ${e.message}`
        );
      }
    }
  }
  throw lastParseErr;
}

const TAILOR_SYSTEM = `You tailor a resume for a specific job application using ONLY the candidate's master profile text as the source of facts.

Project standards (see docs/cv-best-practices.md in the repo): ATS-safe single-column layout, honest keyword alignment, accomplishment-focused bullets, professional human tone.

## Hard rules (must follow)
1. **No fabrication.** Every employer, title, date range, degree, certification, metric, and claim must appear in or be clearly implied by the master profile. If the job asks for a skill you cannot find in the profile, do not imply you have it.
2. **ATS-friendly structure.** The JSON becomes a single-column Word document with these sections only, in this order in the output JSON fields: Summary, Skills, Experience, optional Projects, Education. Use plain language—no text boxes, tables, icons, multi-column layouts, headers/footers. In every string use **ASCII only** for dashes and list punctuation: the hyphen-minus (-) for date ranges (e.g. May 2020 - Present) and inline separators; **do not** use en dash, em dash, middle dot (·), or Unicode bullet glyphs (• etc.); do not prefix bullet array items with • or -.
3. **Standard section labels** in spirit: content maps to Summary, Skills, Experience, Projects, Education—no creative section names.
4. **Keywords.** Mirror wording from the job description **only** when it honestly matches the profile (e.g. profile says "React" and job says "React.js" → you may use "React.js"). Prefer including important job terms that also appear in the profile in Skills and relevant bullets. Do not keyword-stuff or list skills absent from the profile.
5. **Above-the-fold relevance.** Put the strongest evidence for THIS role first: **targetHeadline** is always the fixed label **Software Engineer** (set exactly that string); align the **summary** and **skills** to the posting honestly, then order **experience** by relevance (not only chronology if reordering helps and stays truthful).
6. **Bullets — vary shape; avoid resume-bot cadence; prefer honest quantifiers.** Resume scanners (e.g. Zety-style) flag **duty-only or tool-only** lines with no scope or outcome. Use the full accomplishment pattern (action verb + scope + tools/context + outcome) for **some** bullets when the profile supports it—not for every line. Mix **short, concrete bullets** (one clause, facts straight from the profile) with **longer** ones. Do not make every bullet the same length or a stack of "X, Y, and Z" clauses. Avoid duty-only lines ("responsible for…", "worked on…") without scope or result. **Quantify only with numbers that appear in the profile** (or are clearly implied there)—and **surface those numbers**: counts of apps/projects/people, percentages, durations, scale, or other metrics the profile states. Do **not** use vague quantity words (**multiple, several, various, many**) when the profile gives a specific count—use that count. If the profile truly has no metrics for an achievement, still add **non-numeric specificity** (what shipped, who used it, integration or environment) so the line is not just "Developed X using Y." Never output a standalone tech stack line with no scope or result.
7. **Human, not generic AI tone.** Write like a careful human editor:
   - **Profile voice mirroring:** Reuse the candidate's **exact or near-exact** wording from the master profile for product names, internal role titles, stack labels, and how they describe work—reorder and combine only; do **not** "upgrade" casual profile phrasing into formal marketing prose unless the profile already reads that way.
   - Prefer **nouns, tools, and phrasing grounded in the master profile** over polished abstractions (e.g. vague "increasing maintainability" with no profile support).
   - Concrete outcomes, scope, and technologies; avoid empty adjectives.
   - Avoid clichés and buzzphrases including: results-driven, passionate, synergy, leverage, orchestrated, game-changer, proven track record, dynamic leader, go-getter, thought leader, world-class, impactful, robust (as filler), extensive experience, deep dive, utilize (prefer "use").
   - **Common LLM tells to avoid** in summary and bullets: delve, holistic, tapestry, unlock/unleash (metaphorical hype), competitive landscape, pivotal (as vague filler), moreover/furthermore/it is important to note, "not only … but also …" symmetry. Do **not** use em dashes (—), en dashes (–), or middle dots (·) in strings; use commas, periods, or ASCII hyphen (-) where needed.
   - **Resume-speak to avoid** (unless the profile uses the exact phrase): cross-functional, seamlessly, streamlined, spearheaded, instrumental in, played a key role, end-to-end (as filler), vague "stakeholders" without who they were, "deliverables" as filler, proficient in / strong proficiency (especially in summary—state stack and context instead), effectively (as filler, e.g. "collaborated effectively").
   - **Rhythm (summary):** Do not use three or four **parallel** sentences of the same shape (e.g. "X with Y. Experience in Z. Skilled in A."); mix **one shorter** sentence with **one slightly longer** one when facts allow.
   - **Rhythm (bullets):** Avoid repeating the **same syntactic template** on every line (e.g. past-tense verb + long comma chain + "including …"). Vary bullet openings; do not start more than ~45% of bullets with the same verb stem; not every bullet must start with a past-tense -ed verb.
   - **Skills line:** One ATS-friendly flowing line, comma-separated (e.g. "A, B, C, D, E"). Use commas only, not semicolons.
   - No first person (I, my, me) and do not use "we" for the candidate's own actions.
   - Summary: 2–4 short sentences (roughly 40–600 characters unless profile is very thin). **Tie this role to the posting honestly:** name **1–2 concrete responsibilities, domains, or stack items from the job description** that clearly appear in the profile (no invented fit).
8. **Length.** Prefer concise resumes: trim older roles to 1–2 bullets; do not pad. If the profile is sparse, output a shorter honest resume.

## Output checklist (verify before you answer)
- [ ] Every stated fact traceable to the master profile.
- [ ] **targetHeadline** is exactly **Software Engineer**; summary + skills reflect job + profile overlap without invention; summary mentions honest overlap with the job (1–2 specifics).
- [ ] Experience bullets vary in length and structure; not all long "X, Y, and Z" lines; not the same grammar pattern every bullet.
- [ ] Summary sentences vary in length and shape—not a stack of parallel "X with Y" lines.
- [ ] Wording feels like the **master profile's voice**, not a polished generic upgrade.
- [ ] Where the profile includes counts or metrics, at least some experience bullets reflect them; no vague "multiple/several" when a number exists in the profile; no tool-only one-liners.
- [ ] No tables, pipes-as-layout, tabs-as-columns, or decorative Unicode in any string (no em/en dash or middle dot; use ASCII hyphen - only).
- [ ] Skills line is substantive (tools, languages, platforms from the profile relevant to the job); comma-separated only, no semicolons.
- [ ] No banned clichés, LLM tells, or resume-speak list above; no first person.

## JSON schema (exact keys)
Return a single JSON object:
- "yourName": string (from profile; full name only, no headline)
- "contactLine": string — one line, ATS-friendly facts separated by pipe | or ASCII hyphen-minus - (not Unicode bullets). Include **location** and **each email address** as plain text; **omit phone numbers**. Do not put LinkedIn or portfolio here (use linksDisplay). Example: "City, Country | hello@domain.com"
- "targetHeadline": string — always the exact text **Software Engineer** (export uses this for the resume header title line)
- "summary": string — 2–4 sentences
- "skills": string — comma-separated only; one flowing line for ATS
- "experience": array of { "employer", "title", "dates", "location", "bullets" } — 3–6 bullets per role when supported
- "projects": array of { "name", "bullets" } or [] if none
- "education": array of { "school", "degree", "dates", "detail" }
- "linksDisplay": string or "" — if the profile lists LinkedIn, portfolio/personal site, or GitHub, output one line per link: "Label: full https URL" with the **complete URL as plain text** (required for PDF export). Separate lines with newline. Example: "LinkedIn: https://www.linkedin.com/in/handle\\nPortfolio: https://example.dev/en\\nGitHub: https://github.com/user". Use labels LinkedIn, Portfolio, GitHub as appropriate; otherwise ""
- "languagesLine": string or "" — human languages and level from the profile (e.g. "English - Working knowledge"); use ASCII hyphen (-) only; otherwise ""

**JSON only.** No markdown fences, no commentary outside the JSON.`;

const REVISE_SYSTEM = `You revise an existing tailored-resume JSON object to fix validation issues while obeying the same rules as initial tailoring.

## Absolute rules
1. Use ONLY the master profile for facts—no new employers, dates, degrees, metrics, or skills not supported by the profile.
2. Keep the same JSON keys and schema as the original tailor step.
3. Address the validator feedback: remove clichés, LLM tells (delve, holistic, tapestry, unlock/unleash, competitive landscape, moreover/furthermore, symmetric "not only…but also", em/en dashes, middle dots), resume-speak, and first person; **mirror the master profile's phrasing** where possible instead of generic polished rewrite; replace vague polished phrasing with **concrete profile-grounded wording**; **mix bullet lengths** and openings (not every bullet the same shape or syntax); fix duty-only and **tool-only thin bullets** by adding scope, outcome, and **profile-backed numbers** (never invent metrics); replace "multiple/several/various" with counts from the profile when available; ensure the **summary** honestly echoes 1–2 job-specific terms or responsibilities that appear in both the job text and the profile, with **varied sentence rhythm**; improve honest keyword coverage for job terms that appear in the profile; **skills line:** comma-separated only, no semicolons; preserve ATS-safe plain text (no tables; ASCII hyphen (-) only for dashes/separators, no Unicode bullets). Set **targetHeadline** to exactly **Software Engineer**. Keep **contactLine** without phone numbers (location and email only, pipe-separated). Preserve **linksDisplay** and **languagesLine** when revising; **linksDisplay** must keep labeled lines with **full https URLs** copied from the profile header when those links exist (not domain-only shortcuts). Use "" only if the profile has no such links.
4. Do not add fabrication to pass checks—if a metric is flagged and not in the profile, remove or rephrase without numbers.

**JSON only.** No markdown fences, no commentary.`;

function buildTailorUserMessage({ jobText, profileMarkdown, extracted }) {
  const meta = extracted
    ? `Extracted job metadata (for alignment; job text is source of truth for requirements):\n${JSON.stringify(
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

---BEGIN MASTER PROFILE (only source of facts)---
${profileMarkdown}
---END MASTER PROFILE---

Return the tailored resume JSON as specified in your system instructions.`;
}

function buildReviseUserMessage({
  jobText,
  profileMarkdown,
  extracted,
  previousTailored,
  validationFeedbackJson,
}) {
  const meta = extracted
    ? `Extracted job metadata:\n${JSON.stringify(
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

  return `${meta}---VALIDATION FEEDBACK (fix these issues)---
${validationFeedbackJson}
---END FEEDBACK---

---PREVIOUS RESUME JSON (revise in place; same schema)---
${JSON.stringify(previousTailored, null, 2)}
---END PREVIOUS---

---BEGIN JOB DESCRIPTION---
${jobText}
---END JOB DESCRIPTION---

---BEGIN MASTER PROFILE (only source of facts)---
${profileMarkdown}
---END MASTER PROFILE---

Return the revised resume JSON only.`;
}

function normalizeBullets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(/\n+/);
  const out = [];
  const seen = new Set();
  for (const line of arr) {
    const cleaned = String(line)
      .replace(/^\s*[-*•\d.)]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    const k = cleaned.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cleaned);
  }
  return out;
}

function normalizeResumeAscii(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\uFE58/g, "-")
    .replace(/\uFE63/g, "-")
    .replace(/[\u2022\u25CF\u25AA\u2043\u2219\u2023]/g, "-")
    .replace(/\u00B7/g, "-");
}

function normalizeSkillsSeparators(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\s*;\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*$/, "")
    .trim();
}

function normalizeTailoredResume(raw) {
  const experience = Array.isArray(raw.experience) ? raw.experience : [];
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const education = Array.isArray(raw.education) ? raw.education : [];

  return {
    yourName: normalizeResumeAscii(String(raw.yourName ?? "").trim()),
    contactLine: normalizeResumeAscii(String(raw.contactLine ?? "").trim()),
    targetHeadline: "Software Engineer",
    summary: normalizeResumeAscii(String(raw.summary ?? "").trim()),
    skills: normalizeSkillsSeparators(normalizeResumeAscii(String(raw.skills ?? "").trim())),
    experience: experience.map((e) => ({
      employer: normalizeResumeAscii(String(e?.employer ?? "").trim()),
      title: normalizeResumeAscii(String(e?.title ?? "").trim()),
      dates: normalizeResumeAscii(String(e?.dates ?? "").trim()),
      location: normalizeResumeAscii(String(e?.location ?? "").trim()),
      bullets: normalizeBullets(e?.bullets).map(normalizeResumeAscii),
    })),
    projects: projects.map((p) => ({
      name: normalizeResumeAscii(String(p?.name ?? "").trim()),
      bullets: normalizeBullets(p?.bullets).map(normalizeResumeAscii),
    })),
    education: education.map((ed) => ({
      school: normalizeResumeAscii(String(ed?.school ?? "").trim()),
      degree: normalizeResumeAscii(String(ed?.degree ?? "").trim()),
      dates: normalizeResumeAscii(String(ed?.dates ?? "").trim()),
      detail: normalizeResumeAscii(String(ed?.detail ?? "").trim()),
    })),
    linksDisplay: normalizeResumeAscii(String(raw.linksDisplay ?? "").trim()),
    languagesLine: normalizeResumeAscii(String(raw.languagesLine ?? "").trim()),
  };
}

function assertTailoredUsable(parsed) {
  if (!parsed.yourName && !parsed.contactLine) {
    throw new Error(
      "Tailored resume missing name and contact line — check master profile and try again."
    );
  }
  if (parsed.experience.length === 0) {
    throw new Error(
      "Tailored resume has no experience entries — ensure ## Experience is filled in your master profile."
    );
  }
}

async function tailorResume({ jobText, profileMarkdown, extracted }) {
  const user = buildTailorUserMessage({ jobText, profileMarkdown, extracted });
  const modelOverride = process.env.TAILOR_RESUME_MODEL || undefined;
  const maxTokens =
    Number.parseInt(process.env.TAILOR_RESUME_MAX_TOKENS || "8192", 10) || 8192;
  const temperature = getOptionalFloatEnv("TAILOR_TEMPERATURE");
  const topP = getOptionalFloatEnv("TAILOR_TOP_P");

  const raw = await completeAndParseResumeJson(
    {
      system: TAILOR_SYSTEM,
      user,
      maxTokens,
      modelOverride,
      temperature,
      topP,
    },
    "tailor"
  );

  const parsed = normalizeTailoredResume(raw);
  assertTailoredUsable(parsed);
  return parsed;
}

async function reviseTailoredResume({
  jobText,
  profileMarkdown,
  extracted,
  previousTailored,
  validationFeedbackJson,
}) {
  const user = buildReviseUserMessage({
    jobText,
    profileMarkdown,
    extracted,
    previousTailored,
    validationFeedbackJson,
  });
  const modelOverride = process.env.TAILOR_RESUME_MODEL || undefined;
  const maxTokens =
    Number.parseInt(process.env.TAILOR_RESUME_MAX_TOKENS || "8192", 10) || 8192;
  const temperature = getOptionalFloatEnv("REVISE_TEMPERATURE");
  const topP = getOptionalFloatEnv("REVISE_TOP_P");

  const raw = await completeAndParseResumeJson(
    {
      system: REVISE_SYSTEM,
      user,
      maxTokens,
      modelOverride,
      temperature,
      topP,
    },
    "revise"
  );

  const parsed = normalizeTailoredResume(raw);
  assertTailoredUsable(parsed);
  return parsed;
}

module.exports = {
  tailorResume,
  reviseTailoredResume,
  normalizeTailoredResume,
  normalizeResumeAscii,
  TAILOR_SYSTEM,
  REVISE_SYSTEM,
};
