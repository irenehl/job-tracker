function parseListEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBoolEnv(name, defaultValue = false) {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  const t = String(v).trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "y";
}

function parseIntEnv(name, defaultValue) {
  const n = Number.parseInt(process.env[name] || "", 10);
  return Number.isNaN(n) ? defaultValue : n;
}

module.exports = { parseListEnv, parseBoolEnv, parseIntEnv };
