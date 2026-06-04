const fs = require("fs");
const path = require("path");

const MIN_PROFILE_CHARS = Number.parseInt(process.env.MASTER_PROFILE_MIN_CHARS || "200", 10) || 200;

const EXPECTED_SECTION_HINTS = [
  /##\s*summary/i,
  /##\s*experience/i,
  /##\s*skills/i,
  /##\s*education/i,
];

function loadMasterProfile(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Master profile not found: ${absolutePath}\n` +
        `Create it or set MASTER_PROFILE_PATH in .env.local (see resume/master-profile.example.md).`
    );
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  return { raw, absolutePath };
}

function collectProfileWarnings(raw) {
  const warnings = [];
  if (!raw || !raw.trim()) return warnings;

  if (!/^##\s*summary\b/im.test(raw)) {
    warnings.push(
      "No explicit ## Summary heading found. Add one (see resume/master-profile.example.md) so tailoring has a clear summary block."
    );
  }

  const expIdx = raw.search(/##\s*experience\b/im);
  if (expIdx !== -1) {
    const lines = raw.slice(expIdx).split("\n");
    let expChunk = "";
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && /^## [^#]/.test(lines[i])) break;
      expChunk += `${lines[i]}\n`;
    }
    const digits = expChunk.match(/\d/g);
    const digitCount = digits ? digits.length : 0;
    if (digitCount < 3) {
      warnings.push(
        "Experience section has very few numeric characters; add real metrics, scale, or dates to the master profile if you want stronger quantified bullets on tailored CVs."
      );
    }
  }

  const head = raw.split("\n").slice(0, 20).join("\n");
  const hasLinkedIn = /linkedin\.com/i.test(head);
  const hasGithub = /github\.com/i.test(head);
  if (!hasLinkedIn && !hasGithub && /@/.test(head)) {
    warnings.push(
      "First ~20 lines have email but no linkedin.com or github.com URL; add links to the profile if you want them on the exported contact line."
    );
  }

  return warnings;
}

function validateMasterProfile(raw) {
  const errors = [];
  const hintsFound = [];

  if (!raw || raw.trim().length < MIN_PROFILE_CHARS) {
    errors.push(
      `Profile is too short (${raw?.trim().length ?? 0} chars). Aim for at least ${MIN_PROFILE_CHARS} characters of real content.`
    );
  }

  for (const re of EXPECTED_SECTION_HINTS) {
    const m = raw.match(re);
    if (m) hintsFound.push(m[0].replace(/^#+\s*/, "").trim());
  }

  if (hintsFound.length < 2) {
    errors.push(
      "Expected Markdown sections such as ## Summary, ## Experience, ## Skills, ## Education (at least two present). See resume/master-profile.example.md."
    );
  }

  const expIdx = raw.search(/##\s*experience\b/im);
  if (expIdx !== -1) {
    const fromHeader = raw.slice(expIdx).split("\n");
    const expBodyLines = [];
    for (let i = 1; i < fromHeader.length; i++) {
      const line = fromHeader[i];
      if (/^## [^#]/.test(line)) break;
      expBodyLines.push(line);
    }
    const substantiveLines = expBodyLines
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          (l.startsWith("-") || l.startsWith("*") || l.startsWith("###"))
      );
    if (substantiveLines.length < 2) {
      errors.push(
        "## Experience should include at least two role or bullet lines (see resume/master-profile.example.md — use ### headings and - bullets with outcomes)."
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    hintsFound,
    warnings: collectProfileWarnings(raw),
  };
}

function extractPreferencesSection(raw) {
  if (!raw) return "";
  const match = raw.match(/##\s*preferences\b([\s\S]*?)(?=^##\s|\Z)/im);
  if (!match) return "";
  return match[1].trim();
}

function loadProfileContext(filePath) {
  const { raw, absolutePath } = loadMasterProfile(filePath);
  return {
    profileMarkdown: raw,
    preferencesMarkdown: extractPreferencesSection(raw),
    absolutePath,
  };
}

module.exports = {
  loadMasterProfile,
  loadProfileContext,
  extractPreferencesSection,
  validateMasterProfile,
  MIN_PROFILE_CHARS,
};
