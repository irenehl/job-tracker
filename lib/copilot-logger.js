const fs = require("fs");
const path = require("path");

const LOG_DIR = process.env.COPILOT_LOG_DIR || path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "copilot.log");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function timestamp() {
  return new Date().toISOString();
}

function log(level, message) {
  ensureLogDir();
  const line = `[${timestamp()}] [${level}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
  if (process.env.COPILOT_QUIET !== "1") {
    const prefix = level === "ERROR" ? "✗" : level === "WARN" ? "!" : "·";
    console.log(`${prefix} ${message}`);
  }
}

module.exports = {
  log,
  info: (m) => log("INFO", m),
  warn: (m) => log("WARN", m),
  error: (m) => log("ERROR", m),
  LOG_FILE,
};
