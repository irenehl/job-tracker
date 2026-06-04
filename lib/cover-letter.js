const fs = require("fs");
const path = require("path");
const { completeJson } = require("./llm");
const { parseJsonFromModel } = require("./json-parse");

const COVER_SYSTEM = `You write a short, grounded cover letter for a job application.

Rules:
- Use ONLY facts from the candidate profile and preferences. Do not invent employers, degrees, or metrics.
- 3-4 paragraphs, under 350 words, professional and direct (no fluff, no "I am excited to apply").
- Mention 2-3 specific overlaps between profile and job requirements.
- Output JSON: { "coverLetter": "full letter text with paragraph breaks as \\n\\n" }
- Respond with JSON only.`;

async function generateCoverLetter({
  jobText,
  profileMarkdown,
  preferencesMarkdown,
  extracted,
}) {
  const user = `Role: ${extracted?.position || ""} at ${extracted?.company || ""}

---PREFERENCES---
${preferencesMarkdown || "(none)"}

---PROFILE---
${profileMarkdown.slice(0, 10000)}

---JOB---
${jobText.slice(0, 15000)}
---END---`;

  const modelOverride = process.env.COVER_LETTER_MODEL || process.env.TAILOR_RESUME_MODEL;

  const rawText = await completeJson({
    system: COVER_SYSTEM,
    user,
    maxTokens: Number.parseInt(process.env.COVER_LETTER_MAX_TOKENS || "2048", 10) || 2048,
    modelOverride,
    temperature: Number.parseFloat(process.env.COVER_LETTER_TEMPERATURE || "0.6"),
  });

  const parsed = parseJsonFromModel(rawText);
  return String(parsed.coverLetter || "").trim();
}

async function generateWhyFit({ jobText, profileMarkdown, extracted }) {
  const user = `List 3-5 bullets: why this candidate fits this role. Grounded in profile only.

Role: ${extracted?.position} at ${extracted?.company}

---PROFILE---
${profileMarkdown.slice(0, 8000)}

---JOB---
${jobText.slice(0, 12000)}

Output JSON: { "bullets": string[] }`;

  const rawText = await completeJson({
    system: "Output JSON only. No invented facts.",
    user,
    maxTokens: 800,
  });

  const parsed = parseJsonFromModel(rawText);
  const bullets = Array.isArray(parsed.bullets) ? parsed.bullets : [];
  return bullets.map((b) => `• ${String(b).trim()}`).join("\n");
}

async function generateFormAnswers({ jobText, profileMarkdown, preferencesMarkdown }) {
  const user = `Generate common application form answers grounded in profile/preferences.

---PREFERENCES---
${preferencesMarkdown || ""}

---PROFILE---
${profileMarkdown.slice(0, 8000)}

---JOB---
${jobText.slice(0, 8000)}

Output JSON object with keys like:
salaryExpectations, workAuthorization, startDate, linkedIn, github, portfolio, whyThisRole, yearsExperience, location
Use empty string if unknown. No fabrication.`;

  const rawText = await completeJson({
    system: "Output JSON only. Ground answers in profile.",
    user,
    maxTokens: 1500,
  });

  return parseJsonFromModel(rawText);
}

async function writeApplicationPacketFiles(outDir, { coverLetter, whyFit, formAnswers }) {
  fs.mkdirSync(outDir, { recursive: true });

  const coverPath = path.join(outDir, "cover-letter.md");
  fs.writeFileSync(coverPath, coverLetter || "", "utf8");

  const whyPath = path.join(outDir, "why-fit.md");
  fs.writeFileSync(whyPath, whyFit || "", "utf8");

  const formPath = path.join(outDir, "form-answers.json");
  fs.writeFileSync(formPath, JSON.stringify(formAnswers || {}, null, 2), "utf8");

  const manifest = {
    createdAt: new Date().toISOString(),
    files: {
      coverLetter: coverPath,
      whyFit: whyPath,
      formAnswers: formPath,
    },
  };
  const manifestPath = path.join(outDir, "packet-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { coverPath, whyPath, formPath, manifestPath };
}

module.exports = {
  generateCoverLetter,
  generateWhyFit,
  generateFormAnswers,
  writeApplicationPacketFiles,
};
