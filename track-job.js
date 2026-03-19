// Use .env.local values even if API keys are already set in the shell
require("dotenv").config({ path: ".env.local", override: true });

const fs = require("fs");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const { Client } = require("@notionhq/client");
const readline = require("readline");

/** @type {'openai' | 'anthropic'} */
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
if (LLM_PROVIDER !== "openai" && LLM_PROVIDER !== "anthropic") {
  console.error(
    `Invalid LLM_PROVIDER="${process.env.LLM_PROVIDER}". Use "openai" or "anthropic".`
  );
  process.exit(1);
}

const anthropic =
  LLM_PROVIDER === "anthropic"
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;
const openai =
  LLM_PROVIDER === "openai"
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_PROPERTY_STUDY_THEMES =
  process.env.NOTION_PROPERTY_STUDY_THEMES || "Study themes";
const STUDY_THEMES_MAX_TOPICS = Math.max(
  1,
  Number.parseInt(process.env.NOTION_STUDY_THEMES_MAX_TOPICS || "12", 10) || 12
);

const DEBUG = process.env.TRACK_JOB_DEBUG === "1";

/** Keeps models from echoing template placeholders like "N/A" for every field. */
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

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

function parseJsonFromModel(text) {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) s = fence[1].trim();
  return JSON.parse(s);
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

function normalizeExtractedData(raw) {
  const out = {};
  const keys = ["position", "company", "industry", "notes"];
  for (const k of keys) {
    out[k] = String(raw[k] ?? "").trim();
  }
  out.studyThemes = normalizeStudyThemes(raw.studyThemes);
  return out;
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

function formatStudyThemesForNotion(studyThemes) {
  return studyThemes.map((topic) => `• ${topic}`).join("\n");
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

async function extractJobData(jobText) {
  const userContent = buildExtractionUserMessage(jobText);

  let rawText;

  if (LLM_PROVIDER === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Set OPENAI_API_KEY in .env.local (and LLM_PROVIDER=openai).");
    }
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 1536,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM },
        { role: "user", content: userContent },
      ],
    });
    rawText = completion.choices[0]?.message?.content;
    if (!rawText) throw new Error("OpenAI returned empty content.");
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "Set ANTHROPIC_API_KEY in .env.local, or use LLM_PROVIDER=openai with OPENAI_API_KEY."
      );
    }

    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 1536,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      throw new Error("Unexpected Anthropic response shape.");
    }
    rawText = block.text;
  }

  if (DEBUG) {
    console.error("[track-job debug] Raw model JSON text:\n", rawText, "\n");
  }

  const parsed = normalizeExtractedData(parseJsonFromModel(rawText));
  assertMeaningfulExtraction(parsed, jobText);
  return parsed;
}

/**
 * When job text comes from a pipe (e.g. pbpaste | node track-job.js), stdin is
 * only the pipe and hits EOF after the paste — readline cannot read y/n there.
 * Use the controlling terminal (/dev/tty) for prompts instead.
 */
function ask(question) {
  const pipedStdin = !process.stdin.isTTY;
  const input = pipedStdin ? fs.createReadStream("/dev/tty") : process.stdin;

  const rl = readline.createInterface({
    input,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      rl.close();
      if (pipedStdin && typeof input.destroy === "function") {
        input.destroy();
      }
    };

    rl.question(question, (answer) => {
      cleanup();
      resolve((answer || "").trim().toLowerCase());
    });

    rl.on("error", (err) => {
      cleanup();
      reject(err);
    });
    input.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

async function saveToNotion(data) {
  const today = new Date().toISOString().split("T")[0];
  const studyThemesContent = formatStudyThemesForNotion(data.studyThemes);

  const response = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      Position: {
        title: [{ text: { content: data.position } }],
      },
      Company: {
        rich_text: [{ text: { content: data.company } }],
      },
      // Must match an existing option name on your Notion database (select column).
      Industry: data.industry
        ? { select: { name: data.industry } }
        : { select: null },
      // Must match an existing option on your Status column (not the old "select" type).
      "Application Status": {
        status: { name: process.env.NOTION_STATUS_APPLIED || "Applied" },
      },
      Applied: {
        date: { start: today },
      },
      "Application Link": {
        url: null,
      },
      Notes: {
        rich_text: [{ text: { content: data.notes } }],
      },
      [NOTION_PROPERTY_STUDY_THEMES]: studyThemesContent
        ? { rich_text: [{ text: { content: studyThemesContent } }] }
        : { rich_text: [] },
    },
  });

  return response.id;
}

async function main() {
  let jobText = process.argv[2];

  if (!jobText) {
    if (process.stdin.isTTY) {
      console.error("Usage: node track-job.js \"job text\" OR pbpaste | node track-job.js");
      process.exit(1);
    }
    jobText = await readStdin();
  }

  if (!jobText) {
    console.error("No job description provided.");
    process.exit(1);
  }

  if (jobText.length < 40) {
    console.warn(
      `Warning: input is very short (${jobText.length} chars). If fields look wrong, check the clipboard (pbpaste | wc -c).\n`
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

  const answer = await ask("Save to Notion? (y/n) ");

  if (answer === "y" || answer === "yes") {
    const pageId = await saveToNotion(data);
    console.log(`\nSaved to Notion. Page ID: ${pageId}`);
  } else {
    console.log("Skipped.");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
