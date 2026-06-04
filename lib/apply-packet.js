const fs = require("fs");
const path = require("path");

function fileExists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Load application artifacts from a copilot output folder.
 */
function loadApplyPacket(packetFolder) {
  const root = path.resolve(packetFolder);
  if (!fs.existsSync(root)) {
    return { ok: false, error: `Packet folder missing: ${root}` };
  }

  const resumeMd = path.join(root, "tailored-resume.md");
  const resumeDocx = path.join(root, "tailored-resume.docx");
  const coverPath = path.join(root, "cover-letter.md");
  const formPath = path.join(root, "form-answers.json");
  const manifestPath = path.join(root, "packet-manifest.json");

  const missing = [];
  if (!fileExists(resumeDocx)) missing.push("tailored-resume.docx");
  if (!fileExists(coverPath)) missing.push("cover-letter.md");
  if (!fileExists(formPath)) missing.push("form-answers.json");

  if (missing.length) {
    return { ok: false, error: `Packet incomplete (missing ${missing.join(", ")})`, root };
  }

  let formAnswers = {};
  try {
    formAnswers = JSON.parse(fs.readFileSync(formPath, "utf8"));
  } catch (err) {
    return { ok: false, error: `Invalid form-answers.json: ${err.message}`, root };
  }

  const coverLetter = fs.readFileSync(coverPath, "utf8").trim();
  const resumeMarkdown = fileExists(resumeMd)
    ? fs.readFileSync(resumeMd, "utf8")
    : "";

  return {
    ok: true,
    root,
    resumeDocx,
    resumeMarkdown,
    coverLetter,
    formAnswers,
    manifestPath: fileExists(manifestPath) ? manifestPath : null,
  };
}

module.exports = { loadApplyPacket, fileExists };
