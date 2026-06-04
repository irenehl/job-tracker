const path = require("path");
const { runIngest, hasAnyIngestSource } = require("./ingest-runner");
const { runInbox } = require("./inbox-runner");
const { runAutoPacket, autoPacketFromIngestResult } = require("./auto-packet");
const { runAutoApply, isAutoApplyEnabled } = require("./auto-apply");
const { loadProfileContext } = require("./profile-loader");
const { upsertJobPage } = require("./notion");
const { parseBoolEnv } = require("./env-utils");
const logger = require("./copilot-logger");
const { notify } = require("./notify");

function getProfileCtx() {
  const profilePath =
    process.env.MASTER_PROFILE_PATH || path.join("resume", "master-profile.md");
  return loadProfileContext(profilePath);
}

async function handleHighMatch(result) {
  logger.info(
    `Auto-packet starting: ${result.company} — ${result.title} (score ${result.score})`
  );
  const profileCtx = getProfileCtx();
  const outDir = await autoPacketFromIngestResult(result, profileCtx);

  await upsertJobPage({
    position: result.title,
    company: result.company,
    notes: result.extracted?.notes,
    applicationUrl: result.applicationUrl,
    applicationStatus: process.env.NOTION_STATUS_PACKET_READY || "In progress",
    packetFolder: outDir,
    score: result.score,
    match: result.match,
  });

  logger.info(`Auto-packet: ${outDir}`);
  notify("Job tracker", `Packet ready: ${result.company} — ${result.title}`);
}

function buildOnHighMatch() {
  if (!parseBoolEnv("AUTO_PACKET", true)) return undefined;
  if (!parseBoolEnv("AUTO_PACKET_ON_INGEST", true)) return undefined;
  return handleHighMatch;
}

async function runCopilotCycle() {
  getProfileCtx();

  if (hasAnyIngestSource()) {
    const stats = await runIngest({ onHighMatch: buildOnHighMatch() });
    if (stats.created > 0) {
      notify("Job tracker", `${stats.created} new job(s) in Notion`);
    }
  } else {
    logger.warn(
      "No ingest sources configured (boards, Himalayas, RemoteOK, RSS_URLS)"
    );
  }

  if (parseBoolEnv("AUTO_PACKET", true)) {
    const packetStats = await runAutoPacket();
    if (packetStats.built > 0) {
      notify("Job tracker", `${packetStats.built} packet(s) ready in output/`);
    }
  }

  if (isAutoApplyEnabled()) {
    const applyStats = await runAutoApply();
    if (applyStats.applied > 0) {
      notify("Job tracker", `${applyStats.applied} application(s) submitted`);
    }
  }

  if (parseBoolEnv("COPILOT_INBOX", true)) {
    await runInbox();
  }
}

module.exports = { runCopilotCycle, handleHighMatch, buildOnHighMatch };
