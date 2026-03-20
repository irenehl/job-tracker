const pc = require("picocolors");

function sectionHeader(text) {
  return pc.bold(pc.cyan(text));
}

function severityLabel(severity) {
  switch (severity) {
    case "ok":
      return pc.green(severity);
    case "revise":
      return pc.yellow(severity);
    case "fail":
      return pc.red(severity);
    default:
      return severity;
  }
}

function formatQualityScoresLine(labelPrefix, scores, severity) {
  const n = (x) => pc.bold(String(x));
  const parts = [
    `ATS ${n(scores.ats)}`,
    `relevance ${n(scores.relevance)}`,
    `grounding ${n(scores.grounding)}`,
    `tone ${n(scores.tone)}`,
    `clarity ${n(scores.clarity)}`,
  ].join(" | ");
  return (
    `${labelPrefix}${pc.dim("Quality scores (0–100):")} ${parts} | ` +
    `${pc.dim("severity:")} ${severityLabel(severity)}\n`
  );
}

function promptQuestion(text) {
  return pc.cyan(text);
}

module.exports = {
  red: pc.red,
  yellow: pc.yellow,
  green: pc.green,
  cyan: pc.cyan,
  dim: pc.dim,
  bold: pc.bold,
  magenta: pc.magenta,
  sectionHeader,
  severityLabel,
  formatQualityScoresLine,
  promptQuestion,
};
