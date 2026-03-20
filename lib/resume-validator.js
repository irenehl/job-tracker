const { extractUrlsFromProfileHeader } = require("./resume-contact");

const STOPWORDS = new Set(
  `a an the and or for to of in on at with by from as is was are be been being
  this that these those it its we our you your they their i my me
  into over out up all any both each few more most other some such than too very
  can will just should could`.split(/\s+/)
);

const AI_CLICHES = [
  { re: /results-?driven/i, label: "results-driven" },
  { re: /passionate about/i, label: "passionate about" },
  { re: /\bsynergy\b/i, label: "synergy" },
  { re: /\bleverage(d|s|ing)?\b/i, label: "leverage" },
  { re: /\borchestrat(ed|es|ing)\b/i, label: "orchestrated" },
  { re: /game-?changer/i, label: "game-changer" },
  { re: /proven track record/i, label: "proven track record" },
  { re: /\bdynamic\b.*\bleader\b/i, label: "dynamic leader" },
  { re: /go-?getter/i, label: "go-getter" },
  { re: /thought leader/i, label: "thought leader" },
  { re: /\bharness(ed|ing)?\b/i, label: "harness" },
  { re: /\bimpactful\b/i, label: "impactful" },
  { re: /world-?class/i, label: "world-class" },
  { re: /\butilize(d|s)?\b/i, label: "utilize (prefer 'use')" },
  { re: /\brobust\b/i, label: "robust (often generic)" },
  { re: /\bextensive experience\b/i, label: "extensive experience" },
  { re: /\bdeep dive\b/i, label: "deep dive" },
  { re: /\bneedle-?mover\b/i, label: "needle-mover" },
  { re: /\bcross-?functional\b/i, label: "cross-functional" },
  { re: /\bseamless(ly)?\b/i, label: "seamless/seamlessly" },
  { re: /\bstreamlined\b/i, label: "streamlined" },
  { re: /\bspearhead(ed|s|ing)?\b/i, label: "spearhead" },
  { re: /\binstrumental in\b/i, label: "instrumental in" },
  { re: /\bplayed a (key|pivotal|critical) role\b/i, label: "played a key/pivotal role" },
  { re: /\bcollaborated effectively\b/i, label: "collaborated effectively (often filler)" },
  { re: /\bproficient in\b/i, label: "proficient in (prefer concrete stack phrasing)" },
  { re: /\bdelve(s|d)?\b/i, label: "delve" },
  { re: /\bholistic\b/i, label: "holistic" },
  { re: /\btapestry\b/i, label: "tapestry" },
  { re: /\bunleash(es|ed|ing)?\b/i, label: "unleash" },
  { re: /\bunlock(ed|s|ing)?\s+(the\s+)?(potential|value|insights?|power)\b/i, label: "unlock (metaphorical hype)" },
  { re: /\bcompetitive landscape\b/i, label: "competitive landscape" },
  { re: /\bpivotal\b/i, label: "pivotal (often generic filler)" },
  { re: /\bmoreover\b/i, label: "moreover" },
  { re: /\bfurthermore\b/i, label: "furthermore" },
  { re: /\bit is important to note\b/i, label: "it is important to note" },
  { re: /\bnot only\b/i, label: "not only … but also (symmetric filler)" },
];

const MULTI_COLUMN_HINTS = /\t{2,}|\s{3,}\|\s{3,}/;

const WEAK_BULLET_START =
  /^(responsible for|duties included|worked on|helped with|assisted with|tasked with)\b/i;

const THIN_TOOL_VERB =
  /^(built|developed|created|implemented|designed|maintained|delivered|wrote|used|integrated)\s+/i;

const FIRST_PERSON = /\b(I|my|me)\b/i;

function isThinToolOnlyBullet(text) {
  const t = String(text).trim();
  if (t.length > 62) return false;
  if (/\d/.test(t)) return false;
  if (!THIN_TOOL_VERB.test(t)) return false;
  if (!/\b(using|with)\s+[A-Za-z0-9.#+/]+/.test(t)) return false;
  if ((t.match(/,/g) || []).length > 1) return false;
  if (/\b(for|to support|to enable|including|that served|across)\b/i.test(t)) return false;
  return true;
}

function profileLikelyHasQuantifiers(profileLower) {
  return (
    /\d+\s*\+/.test(profileLower) ||
    /\b\d+\s*(apps?|projects?|products|apis?|teams?|members?|people|engineers?|developers?|clients?|users?|services?)\b/i.test(
      profileLower
    ) ||
    /\d[\d,.]*\s*%/.test(profileLower) ||
    /\b(reduced|increased|cut|grew|saved|latency|throughput|requests?)\b[^\n]{0,50}\d/i.test(
      profileLower
    )
  );
}

const VAGUE_QUANTITY = /\b(multiple|several|various)\b/i;

function tokenizeMeaningful(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9%+.#/]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function computeGroundingRatio(profileLower, phrase) {
  const tokens = tokenizeMeaningful(phrase);
  if (tokens.length === 0) return 1;
  let hits = 0;
  for (const t of tokens) {
    if (profileLower.includes(t)) hits += 1;
  }
  return hits / tokens.length;
}

function suspiciousNumbers(profileLower, phrase) {
  const nums = phrase.match(/\d[\d,]*%?|\d+\.\d+/g);
  if (!nums) return false;
  for (const n of nums) {
    const normalized = n.replace(/,/g, "");
    if (!profileLower.includes(normalized) && !profileLower.includes(n)) {
      return true;
    }
  }
  return false;
}

function honestJobKeywords(jobText, profileLower) {
  const tokens = tokenizeMeaningful(jobText);
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (profileLower.includes(t)) out.push(t);
  }
  return out;
}

function collectAllResumeText(data) {
  return [
    data.summary,
    data.skills,
    data.targetHeadline,
    data.linksDisplay ?? "",
    data.languagesLine ?? "",
    ...data.experience.flatMap((e) => [e.title, e.employer, e.dates, e.location, ...e.bullets]),
    ...data.projects.flatMap((p) => [p.name, ...p.bullets]),
    ...data.education.flatMap((e) => [e.school, e.degree, e.dates, e.detail]),
  ].join("\n");
}

function formatValidationForLLM(v) {
  return JSON.stringify(
    {
      severity: v.severity,
      scores: v.scores,
      blocking: v.blocking,
      errors: v.errors,
      warnings: v.warnings.slice(0, 25),
      aiToneFlags: v.aiToneFlags.slice(0, 25),
    },
    null,
    2
  );
}

function validateTailoredResume(data, profileMarkdown, jobText = "") {
  const warnings = [];
  const errors = [];
  const blocking = [];
  const aiToneFlags = [];

  const blob = profileMarkdown.toLowerCase();
  const jobLower = String(jobText || "").toLowerCase();
  const resumeText = collectAllResumeText(data);
  const allLower = resumeText.toLowerCase();

  let atsScore = 100;
  let relevanceScore = 100;
  let groundingAggregate = 100;
  let toneScore = 100;
  let clarityScore = 100;

  if (MULTI_COLUMN_HINTS.test(resumeText)) {
    warnings.push(
      "Text may look multi-column or table-like; ATS prefers a single linear flow."
    );
    atsScore -= 25;
  }

  if (/\|\s*[^\n]+\s*\|/.test(resumeText)) {
    warnings.push("Pipe characters resemble Markdown tables; remove table-style formatting for ATS.");
    atsScore -= 15;
  }

  if (/[\u2022\u25CF\u25AA\u2013\u2014\u2212\u00B7\u2023\uFE58\uFE63\u2219]/.test(resumeText)) {
    warnings.push(
      "Unicode bullets or dash-like characters in resume strings; use ASCII hyphen (-) only for dashes and separators."
    );
    atsScore -= 5;
  }

  const profileHeaderUrls = extractUrlsFromProfileHeader(profileMarkdown);
  if (profileHeaderUrls.length > 0) {
    const ld = String(data.linksDisplay || "");
    const ldLower = ld.toLowerCase();
    const missing = profileHeaderUrls.filter((u) => !ldLower.includes(u.toLowerCase()));
    if (missing.length > 0) {
      warnings.push(
        `Profile header includes ${profileHeaderUrls.length} link URL(s); tailored linksDisplay does not repeat ${missing.length} of them as full https text (export still merges profile URLs into the DOCX). Add labeled "Label: https://..." lines to linksDisplay for parity.`
      );
    }
  }

  const honestKw = honestJobKeywords(jobText || "", blob);
  if (honestKw.length >= 3) {
    let hits = 0;
    for (const t of honestKw) {
      if (allLower.includes(t)) hits += 1;
    }
    relevanceScore = Math.round((hits / honestKw.length) * 100);
    if (relevanceScore < 55) {
      warnings.push(
        `Low overlap between job keywords (also in your profile) and the resume text (${relevanceScore}%); tailor skills and bullets using honest matches.`
      );
    }
  } else if (jobLower.length > 80) {
    relevanceScore = 75;
    warnings.push(
      "Few job keywords overlap the master profile; add matching skills/experience to the profile or expect weaker tailoring."
    );
  }

  for (const { re, label } of AI_CLICHES) {
    if (re.test(resumeText)) {
      aiToneFlags.push(`Possible cliché / buzzphrase: "${label}"`);
    }
  }

  if (FIRST_PERSON.test(resumeText)) {
    aiToneFlags.push("First person (I/my/me) detected; use implied subject instead.");
  }

  toneScore -= Math.min(45, aiToneFlags.length * 12);

  const bulletStarts = data.experience.flatMap((e) =>
    e.bullets.map((b) => b.split(/\s+/)[0])
  );
  if (bulletStarts.length >= 4) {
    const counts = {};
    for (const w of bulletStarts) {
      const key = w.toLowerCase().replace(/[^a-z]/g, "");
      if (key.length < 3) continue;
      counts[key] = (counts[key] || 0) + 1;
    }
    const repeated = Object.entries(counts).filter(
      ([, n]) => n / bulletStarts.length > 0.45
    );
    if (repeated.length) {
      warnings.push(
        `Many bullets start the same way (${repeated.map(([w]) => w).join(", ")}) — vary openings.`
      );
      toneScore -= 12;
    }
  }

  let lowOverlapBullets = 0;
  let suspiciousNumberCount = 0;
  let weakBulletCount = 0;
  let thinToolOnlyCount = 0;
  let vagueQuantityBulletCount = 0;

  const checkPhrase = (phrase, label, overlapThreshold) => {
    if (!phrase || phrase.length < 12) return;
    if (suspiciousNumbers(blob, phrase)) {
      suspiciousNumberCount += 1;
      warnings.push(
        `${label} may introduce numbers not found in profile — verify: "${phrase.slice(0, 90)}..."`
      );
      groundingAggregate -= 7;
    }
    const g = computeGroundingRatio(blob, phrase);
    if (g < overlapThreshold) {
      lowOverlapBullets += 1;
      warnings.push(
        `Low overlap with profile (${label}) — review: "${phrase.slice(0, 100)}..."`
      );
      groundingAggregate -= 5;
    }
  };

  checkPhrase(data.summary, "Summary", 0.18);
  checkPhrase(data.targetHeadline, "Headline", 0.15);
  checkPhrase(data.skills, "Skills", 0.15);

  for (const exp of data.experience) {
    for (const b of exp.bullets) {
      checkPhrase(b, "Experience bullet", 0.25);
      if (WEAK_BULLET_START.test(b.trim()) && b.length < 90) {
        weakBulletCount += 1;
        warnings.push(
          `Bullet may be duty-only or vague — strengthen with scope/tools/outcome: "${b.slice(0, 80)}..."`
        );
        clarityScore -= 4;
      }
      if (isThinToolOnlyBullet(b)) {
        thinToolOnlyCount += 1;
        if (thinToolOnlyCount <= 4) {
          warnings.push(
            `Experience bullet is very thin (tool-only); add scope, outcome, or a count from the profile: "${b.slice(0, 85)}..."`
          );
        }
        clarityScore -= 5;
      }
      if (VAGUE_QUANTITY.test(b)) {
        vagueQuantityBulletCount += 1;
        if (vagueQuantityBulletCount <= 3) {
          warnings.push(
            `Prefer a specific count from the master profile over vague wording (multiple/several/various): "${b.slice(0, 85)}..."`
          );
        }
        clarityScore -= 3;
      }
    }
  }

  const allExpBullets = data.experience.flatMap((e) => e.bullets);
  const bulletsWithDigit = allExpBullets.filter((b) => /\d/.test(b)).length;
  if (
    profileLikelyHasQuantifiers(blob) &&
    allExpBullets.length >= 2 &&
    bulletsWithDigit === 0
  ) {
    warnings.push(
      "Your master profile appears to include quantities or metrics, but no experience bullets contain numbers; add honest counts or metrics from the profile where they fit."
    );
    clarityScore -= 10;
  }

  for (const p of data.projects) {
    for (const b of p.bullets) {
      checkPhrase(b, "Project bullet", 0.22);
    }
  }

  for (const ed of data.education) {
    const line = [ed.degree, ed.school, ed.detail].filter(Boolean).join(" ");
    checkPhrase(line, "Education", 0.2);
  }

  if (suspiciousNumberCount >= 3) {
    blocking.push("Multiple bullets contain numbers not found in the master profile (possible fabrication).");
    errors.push("Grounding: verify numeric claims against your profile.");
    groundingAggregate -= 25;
  }

  if (lowOverlapBullets >= 6) {
    blocking.push("Too many lines have very low overlap with the master profile.");
    errors.push("Grounding: tighten phrasing to stay faithful to the profile.");
    groundingAggregate -= 20;
  }

  if (!data.summary || data.summary.length < 40) {
    warnings.push("Summary is very short; use 2–4 sentences if the profile allows.");
    clarityScore -= 15;
  }
  if (data.summary && data.summary.length > 900) {
    warnings.push("Summary is long; tighten to a tight 2–4 sentences.");
    clarityScore -= 8;
  }

  if (!data.skills || data.skills.length < 20) {
    warnings.push("Skills line is short; include key tools from the profile when relevant.");
    clarityScore -= 12;
  }

  if (!data.targetHeadline) {
    warnings.push("Missing target headline; add a one-line role aligned with the posting.");
    clarityScore -= 10;
  }

  if (weakBulletCount >= 4) {
    warnings.push("Several bullets look duty-only; add outcomes and specifics from the profile.");
    clarityScore -= 10;
  }

  if (thinToolOnlyCount >= 3) {
    warnings.push(
      "Several experience bullets are tool-only or too short; merge with scope, outcomes, or profile-backed metrics (do not invent numbers)."
    );
    clarityScore -= 8;
  }

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  const scores = {
    ats: clamp(atsScore),
    relevance: clamp(relevanceScore),
    grounding: clamp(groundingAggregate),
    tone: clamp(toneScore),
    clarity: clamp(clarityScore),
  };

  const overlapWarnings = warnings.filter((w) => w.includes("Low overlap"));

  let severity = "ok";

  if (errors.length > 0 || blocking.length > 0 || scores.grounding < 38) {
    severity = "fail";
  } else if (
    aiToneFlags.length > 0 ||
    overlapWarnings.length >= 2 ||
    scores.relevance < 58 ||
    scores.tone < 72 ||
    scores.clarity < 65 ||
    weakBulletCount >= 2 ||
    thinToolOnlyCount >= 1 ||
    vagueQuantityBulletCount >= 2
  ) {
    severity = "revise";
  }

  const reviseRecommended = severity === "revise";

  return {
    scores,
    severity,
    warnings,
    errors,
    blocking,
    aiToneFlags,
    reviseRecommended,
  };
}

function shouldFailStrict(v, opts = {}) {
  const overlapWarnings = v.warnings.filter((w) => w.includes("Low overlap"));
  if (v.aiToneFlags.length > 0) return true;
  if (overlapWarnings.length >= 3) return true;
  if (v.scores.grounding < 55) return true;
  if (v.blocking.length > 0 || v.errors.length > 0) return true;
  if (opts.afterRevision && v.severity === "revise") return true;
  return false;
}

module.exports = {
  validateTailoredResume,
  formatValidationForLLM,
  shouldFailStrict,
  groundingScore: computeGroundingRatio,
  suspiciousNumbers,
  tokenizeMeaningful,
};
