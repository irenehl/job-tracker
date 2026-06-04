const { detectAts } = require("./ats-detect");

const ATS_URL_PATTERN =
  /https?:\/\/[^"'\\\s<>\])}+]*(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)[^"'\\\s<>\])}+]*/gi;

const JSON_URL_FIELDS = [
  "applicationUrl",
  "applicationLink",
  "applyUrl",
  "apply_url",
  "externalApplyUrl",
  "externalApplicationUrl",
  "originUrl",
  "origin_url",
];

function normalizeAtsUrl(raw) {
  if (!raw) return null;
  let u = String(raw).replace(/&amp;/g, "&").trim();
  if (u.startsWith("//")) u = `https:${u}`;
  u = u.replace(/\\+$/, "").replace(/[),.;]+$/, "");
  return u;
}

function extractAtsUrlsFromText(text) {
  if (!text) return [];
  const found = new Set();
  const haystack = String(text);
  const unescaped = haystack.replace(/\\\//g, "/");

  for (const chunk of [haystack, unescaped]) {
    for (const m of chunk.matchAll(ATS_URL_PATTERN)) {
      const u = normalizeAtsUrl(m[0]);
      if (u && detectAts(u)) found.add(u);
    }
  }

  for (const field of JSON_URL_FIELDS) {
    const re = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`, "gi");
    for (const m of haystack.matchAll(re)) {
      const u = normalizeAtsUrl(m[1].replace(/\\\//g, "/"));
      if (u && detectAts(u)) found.add(u);
    }
  }

  return [...found];
}

function pickFirstAtsUrl(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const trimmed = String(c).trim();
    const fromText = extractAtsUrlsFromText(trimmed);
    if (fromText.length) return fromText[0];
    if (detectAts(trimmed) && /^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
  }
  return null;
}

module.exports = {
  extractAtsUrlsFromText,
  pickFirstAtsUrl,
  normalizeAtsUrl,
};
