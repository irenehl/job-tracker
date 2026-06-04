#!/usr/bin/env node
/**
 * Background copilot — no manual steps:
 *   scrape/APIs → score → Notion → auto CV/cover → inbox briefs
 *
 *   node run-copilot.js          # daemon (24/7)
 *   node run-copilot.js --once          # single cycle (cron OK too)
 *   node run-copilot.js --packet-only   # auto-packet pending Apply jobs only (no ingest)
 */
require("dotenv").config({ path: ".env.local", override: true });

const { getProvider } = require("./lib/llm");
const { runIngest, hasAnyIngestSource } = require("./lib/ingest-runner");
const { runInbox } = require("./lib/inbox-runner");
const { runAutoPacket } = require("./lib/auto-packet");
const { runAutoApply, isAutoApplyEnabled } = require("./lib/auto-apply");
const { runCopilotCycle, buildOnHighMatch } = require("./lib/copilot-cycle");
const { parseBoolEnv, parseIntEnv } = require("./lib/env-utils");
const logger = require("./lib/copilot-logger");
const { LOG_FILE } = require("./lib/copilot-logger");

getProvider();

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const ingestOnly = args.includes("--ingest-only");
  const inboxOnly = args.includes("--inbox-only");
  const packetOnly = args.includes("--packet-only");

  if (packetOnly) {
    const stats = await runAutoPacket();
    logger.info(
      `Packet run done: queued=${stats.queued} built=${stats.built} errors=${stats.errors}`
    );
    return;
  }

  if (ingestOnly) {
    await runIngest({ onHighMatch: buildOnHighMatch() });
    if (parseBoolEnv("AUTO_PACKET", true)) await runAutoPacket();
    if (isAutoApplyEnabled()) await runAutoApply();
    return;
  }
  if (inboxOnly) {
    await runInbox();
    return;
  }

  if (once) {
    await runCopilotCycle();
    logger.info("Cycle complete");
    return;
  }

  const ingestMin = parseIntEnv("INGEST_INTERVAL_MINUTES", 360);
  const inboxMin = parseIntEnv("INBOX_INTERVAL_MINUTES", 15);
  let lastIngest = 0;
  let lastInbox = 0;

  logger.info(`Daemon started — log: ${LOG_FILE}`);
  logger.info(`Ingest every ${ingestMin}m | Inbox every ${inboxMin}m`);

  await runCopilotCycle();
  lastIngest = Date.now();
  lastInbox = Date.now();

  for (;;) {
    const now = Date.now();
    try {
      if (now - lastIngest >= ingestMin * 60 * 1000) {
        if (hasAnyIngestSource()) {
          await runIngest({ onHighMatch: buildOnHighMatch() });
          if (parseBoolEnv("AUTO_PACKET", true)) await runAutoPacket();
          if (isAutoApplyEnabled()) await runAutoApply();
        }
        lastIngest = now;
      }
      if (now - lastInbox >= inboxMin * 60 * 1000) {
        await runInbox();
        lastInbox = now;
      }
    } catch (err) {
      logger.error(err.message);
    }
    await new Promise((r) =>
      setTimeout(r, parseIntEnv("COPILOT_TICK_SECONDS", 60) * 1000)
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger.error(err.message);
    process.exit(1);
  });
}
