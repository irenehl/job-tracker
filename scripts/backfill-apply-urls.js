/**
 * Re-resolve Application Link for Notion rows that still point at aggregator URLs.
 *
 *   node scripts/backfill-apply-urls.js
 *   node scripts/backfill-apply-urls.js --dry-run
 *   node scripts/backfill-apply-urls.js --limit 20
 */
require("dotenv").config({ path: ".env.local", override: true });

const { Client } = require("@notionhq/client");
const { detectAts } = require("../lib/ats-detect");
const {
  resolveApplyUrl,
  isResolveEnabled,
  isAggregatorUrl,
  inferAggregatorLabel,
} = require("../lib/resolve-apply-url");
const { isNotionConfigured } = require("../lib/notion");
const logger = require("../lib/copilot-logger");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit = 50;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10) || limit;
      i++;
    }
  }
  return { dryRun, limit };
}

async function getDataSourceId() {
  if (process.env.NOTION_DATA_SOURCE_ID) return process.env.NOTION_DATA_SOURCE_ID.trim();
  const db = await notion.databases.retrieve({ database_id: DATABASE_ID });
  const id = db.data_sources?.[0]?.id;
  if (!id) throw new Error("Set NOTION_DATA_SOURCE_ID in .env.local");
  return id;
}

async function main() {
  if (!isNotionConfigured()) {
    throw new Error("Notion not configured");
  }
  if (!isResolveEnabled()) {
    throw new Error("RESOLVE_ATS_URLS is disabled");
  }

  const { dryRun, limit } = parseArgs();
  const data_source_id = await getDataSourceId();
  const response = await notion.dataSources.query({
    data_source_id,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    page_size: Math.min(limit, 100),
  });

  let scanned = 0;
  let updated = 0;

  for (const page of response.results) {
    const url = page.properties?.["Application Link"]?.url || "";
    if (!url || detectAts(url) || !isAggregatorUrl(url)) continue;

    scanned++;
    const resolved = await resolveApplyUrl(url, { forceFetch: true });
    if (!resolved?.resolvedUrl || resolved.source !== "resolved") {
      logger.warn(`No ATS URL for ${url}`);
      continue;
    }

    const label = inferAggregatorLabel(url);
    logger.info(
      `${dryRun ? "[dry-run] " : ""}Resolved ATS URL: ${label} → ${resolved.ats?.type}`
    );
    logger.info(`  ${url}`);
    logger.info(`  → ${resolved.resolvedUrl}`);

    if (!dryRun) {
      await notion.pages.update({
        page_id: page.id,
        properties: {
          "Application Link": { url: resolved.resolvedUrl },
        },
      });
    }
    updated++;
  }

  logger.info(
    `Backfill done: ${updated} ${dryRun ? "would update" : "updated"}, ${scanned} aggregator row(s) scanned`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
