const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/;
const URL_IN_TEXT_RE = /https?:\/\/[^\s)>\]"']+/gi;

function splitContactLine(contactLine) {
  if (!contactLine || !String(contactLine).trim()) return [];
  const raw = String(contactLine).trim();
  if (raw.includes("\u2022")) {
    return raw.split(/\s*\u2022\s*/).map((s) => s.trim()).filter(Boolean);
  }
  if (raw.includes("|")) {
    return raw.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  }
  return [raw];
}

function joinContactCommaLine(contactLine) {
  return splitContactLine(contactLine).join(", ");
}

/**
 * Split contactLine segments (pipe/bullet-separated) into location vs email vs phone for header layout.
 * @returns {{ location: string, emails: string[], phones: string[] }}
 */
function splitContactForHeader(contactLine) {
  const parts = splitContactLine(contactLine);
  const emails = [];
  const phones = [];
  const locParts = [];
  const emailOnly = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  for (const p of parts) {
    const trimmed = String(p).trim();
    if (!trimmed) continue;
    if (emailOnly.test(trimmed)) {
      emails.push(trimmed);
      continue;
    }
    const phMatch = trimmed.match(PHONE_RE);
    if (
      phMatch &&
      looksLikePhone(phMatch[0]) &&
      trimmed.length <= 36 &&
      !trimmed.includes("@")
    ) {
      phones.push(trimmed);
      continue;
    }
    locParts.push(trimmed);
  }

  return {
    location: locParts.join(", ").trim(),
    emails,
    phones,
  };
}

function looksLikePhone(s) {
  const digits = String(s).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 16;
}

/**
 * Parse contactLine into ATS-friendly labeled lines, or fall back to one comma line.
 * @returns {{ useStructured: boolean, lines: string[], singleLine: string }}
 */
function parseContactLineForAts(contactLine) {
  const raw = String(contactLine || "").trim();
  const fallbackSingle = joinContactCommaLine(contactLine);

  if (!raw) {
    return { useStructured: false, lines: [], singleLine: "" };
  }

  const emails = [...new Set(raw.match(EMAIL_RE) || [])];
  let remainder = raw;
  for (const e of emails) {
    remainder = remainder.split(e).join(" ");
  }

  const phMatch = remainder.match(PHONE_RE);
  const phone = phMatch && looksLikePhone(phMatch[0]) ? phMatch[0].trim() : "";
  if (phone) {
    remainder = remainder.replace(phMatch[0], " ");
  }

  remainder = remainder
    .replace(/[|•,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const lines = [];
  if (remainder.length >= 2) {
    lines.push(`Location: ${remainder}`);
  }
  if (emails.length === 1) {
    lines.push(`Email: ${emails[0]}`);
  } else if (emails.length > 1) {
    lines.push(`Email: ${emails.join("; ")}`);
  }
  if (phone) {
    lines.push(`Phone: ${phone}`);
  }

  if (lines.length === 0) {
    return { useStructured: false, lines: [], singleLine: fallbackSingle };
  }

  return { useStructured: true, lines, singleLine: fallbackSingle };
}

function normalizeUrl(u) {
  let s = String(u || "").trim();
  if (!s) return "";
  s = s.replace(/[),.;]+$/, "");
  return s;
}

function collectUrlsFromText(text) {
  const out = [];
  const seen = new Set();
  if (!text) return out;
  const md = String(text).matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi);
  for (const m of md) {
    const u = normalizeUrl(m[2]);
    if (u && !seen.has(u.toLowerCase())) {
      seen.add(u.toLowerCase());
      out.push(u);
    }
  }
  const bare = String(text).match(URL_IN_TEXT_RE) || [];
  for (const u of bare) {
    const n = normalizeUrl(u);
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      out.push(n);
    }
  }
  return out;
}

/**
 * Pull http(s) URLs from the profile header (content before the first ## section).
 * @param {string} profileMarkdown
 * @returns {string[]}
 */
function extractUrlsFromProfileHeader(profileMarkdown) {
  const raw = String(profileMarkdown || "");
  const end = raw.search(/^##\s+/m);
  const head = end === -1 ? raw.slice(0, 2500) : raw.slice(0, end);
  return collectUrlsFromText(head);
}

function labelForUrl(url) {
  const lower = url.toLowerCase();
  if (lower.includes("linkedin.com")) return "LinkedIn";
  if (lower.includes("github.com")) return "GitHub";
  if (lower.includes("gitlab.com")) return "GitLab";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "Portfolio";
  } catch {
    return "Portfolio";
  }
}

function parseLinksDisplayLines(linksDisplay) {
  if (!linksDisplay || !String(linksDisplay).trim()) return [];
  return String(linksDisplay)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function lineCoversUrl(line, url) {
  const u = url.toLowerCase();
  const l = line.toLowerCase();
  if (l.includes(u)) return true;
  try {
    const path = new URL(url).pathname + new URL(url).search;
    if (path.length > 4 && l.includes(path.toLowerCase())) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Merge profile URLs into linksDisplay so LinkedIn / portfolio survive weak model output.
 * @param {string} linksDisplay
 * @param {string} profileMarkdown
 * @returns {string}
 */
function mergeLinksDisplayFromProfile(linksDisplay, profileMarkdown) {
  const existingLines = parseLinksDisplayLines(linksDisplay);
  const urls = extractUrlsFromProfileHeader(profileMarkdown);

  const merged = [...existingLines];
  for (const url of urls) {
    const already = merged.some((line) => lineCoversUrl(line, url));
    if (!already) {
      merged.push(`${labelForUrl(url)}: ${url}`);
    }
  }

  return merged.join("\n").trim();
}

module.exports = {
  splitContactLine,
  joinContactCommaLine,
  splitContactForHeader,
  parseContactLineForAts,
  extractUrlsFromProfileHeader,
  mergeLinksDisplayFromProfile,
  parseLinksDisplayLines,
  labelForUrl,
};
