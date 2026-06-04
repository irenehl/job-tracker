require("dotenv").config({ path: ".env.local", override: true });

const { getProvider } = require("./lib/llm");
const { runIngest, hasAnyIngestSource } = require("./lib/ingest-runner");
const { buildOnHighMatch } = require("./lib/copilot-cycle");
const { runAutoPacket } = require("./lib/auto-packet");
const { parseBoolEnv } = require("./lib/env-utils");
const { red } = require("./lib/terminal-style");

getProvider();

function parseArgs() {
  const args = process.argv.slice(2);
  let boardFilter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--board" && args[i + 1]) {
      boardFilter = args[i + 1].toLowerCase();
      i++;
    }
  }
  return { boardFilter };
}

async function main() {
  if (!hasAnyIngestSource()) {
    console.error(
      red(
        "No sources configured. Set GREENHOUSE_BOARDS, HIMALAYAS (default on), REMOTEOK, RSS_URLS, etc."
      )
    );
    process.exit(1);
  }

  const { boardFilter } = parseArgs();
  await runIngest({ boardFilter, onHighMatch: buildOnHighMatch() });

  if (parseBoolEnv("AUTO_PACKET", true)) {
    await runAutoPacket();
  }
}

main().catch((err) => {
  console.error(red(err.message));
  process.exit(1);
});
