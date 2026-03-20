const path = require("path");

function slugify(s, maxLen = 48) {
  const base = String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!base) return "unknown";
  return base.slice(0, maxLen).replace(/-+$/g, "") || "unknown";
}

function buildOutputSubdir({ company, position, outputRoot }) {
  const base =
    outputRoot ||
    path.resolve(process.cwd(), process.env.RESUME_OUTPUT_DIR || "output");
  const date = new Date().toISOString().split("T")[0];
  const dirName = `${date}_${slugify(company, 32)}_${slugify(position, 40)}`;
  return path.join(base, dirName);
}

module.exports = { slugify, buildOutputSubdir };
