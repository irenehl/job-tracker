#!/usr/bin/env node
/**
 * One-off: add optional copilot columns to the Notion job tracker data source.
 * Usage: node scripts/add-notion-copilot-columns.js [--test-upsert]
 */
require("dotenv").config({ path: ".env.local", override: true });

const { Client } = require("@notionhq/client");
const { upsertJobPage, getDataSourceId, notion } = require("../lib/notion");

const COPILOT_COLUMNS = {
  Score: {
    type: "number",
    number: { format: "number" },
  },
  Match: {
    type: "select",
    select: {
      options: [{ name: "Apply" }, { name: "Maybe" }, { name: "Skip" }],
    },
  },
  Source: {
    type: "select",
    select: {
      options: [
        { name: "paste" },
        { name: "greenhouse" },
        { name: "lever" },
        { name: "ashby" },
        { name: "himalayas" },
        { name: "remoteok" },
      ],
    },
  },
  "Match reasons": {
    type: "rich_text",
    rich_text: {},
  },
  "Packet folder": {
    type: "rich_text",
    rich_text: {},
  },
};

async function main() {
  const testUpsert = process.argv.includes("--test-upsert");

  if (!process.env.NOTION_API_KEY?.trim()) {
    console.error("NOTION_API_KEY missing in .env.local");
    process.exit(1);
  }

  const dataSourceId = await getDataSourceId();
  console.log("Data source:", dataSourceId);

  const before = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const existing = new Set(Object.keys(before.properties || {}));
  console.log("Existing properties:", [...existing].sort().join(", "));

  const toAdd = {};
  const added = [];
  const skipped = [];

  for (const [name, config] of Object.entries(COPILOT_COLUMNS)) {
    if (existing.has(name)) {
      skipped.push(name);
    } else {
      toAdd[name] = config;
      added.push(name);
    }
  }

  if (added.length === 0) {
    console.log("All copilot columns already present.");
  } else {
    console.log("Adding via notion.dataSources.update:", added.join(", "));
    await notion.dataSources.update({
      data_source_id: dataSourceId,
      properties: toAdd,
    });
    console.log("Update succeeded.");
  }

  const after = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const afterNames = Object.keys(after.properties || {}).sort();
  const copilotNames = Object.keys(COPILOT_COLUMNS);
  const verify = {};
  for (const name of copilotNames) {
    const p = after.properties[name];
    verify[name] = p
      ? { present: true, type: p.type }
      : { present: false };
  }
  console.log("\nVerification:");
  console.log(JSON.stringify(verify, null, 2));

  const allPresent = copilotNames.every((n) => verify[n].present);
  if (!allPresent) {
    console.error("Some columns still missing after API update.");
    process.exit(1);
  }

  if (testUpsert) {
    const testUrl = `https://example.com/job-tracker-schema-test-${Date.now()}`;
    console.log("\nTest upsertJobPage (dedicated columns)...");
    const result = await upsertJobPage({
      position: "[schema-test] Copilot columns",
      company: "Job Tracker",
      notes: "Auto test row — safe to delete.",
      applicationUrl: testUrl,
      source: "paste",
      score: 42,
      match: "Maybe",
      matchReasons: "Schema verification test",
      packetFolder: "/tmp/job-tracker-packet-test",
      applicationStatus: process.env.NOTION_STATUS_DISCOVERED || "Not applied",
    });
    const page = await notion.pages.retrieve({ page_id: result.pageId });
    const props = page.properties;
    const check = {
      Score: props.Score?.number,
      Match: props.Match?.select?.name,
      Source: props.Source?.select?.name,
      matchReasons: props["Match reasons"]?.rich_text?.[0]?.plain_text?.slice(0, 40),
      packetFolder: props["Packet folder"]?.rich_text?.[0]?.plain_text?.slice(0, 40),
      notesHasCopilotMeta: (props.Notes?.rich_text?.[0]?.plain_text || "").includes(
        "[copilot]"
      ),
    };
    console.log("Written properties:", JSON.stringify(check, null, 2));
    if (check.notesHasCopilotMeta) {
      console.warn("Notes still contains [copilot] meta — columns may not be wired.");
    }
    console.log("Test page id:", result.pageId, "(delete in Notion if desired)");
  }

  return { added, skipped, api: "notion.dataSources.update", verify, allPresent };
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
