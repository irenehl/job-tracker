/**
 * Unit-style checks + optional live URL resolution.
 *
 *   node scripts/test-resolve-apply-url.js
 *   node scripts/test-resolve-apply-url.js --live "https://himalayas.app/..."
 */
require("dotenv").config({ path: ".env.local", override: true });

const {
  extractAtsUrlsFromText,
  pickFirstAtsUrl,
  resolveApplyUrl,
} = require("../lib/resolve-apply-url");
const { detectAts } = require("../lib/ats-detect");

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failed++;
    console.error(` FAIL ${label}`);
  }
}

function runUnitTests() {
  console.log("Unit tests (no network)\n");

  const html =
    '<a href="https://boards.greenhouse.io/acme/jobs/123456">Apply</a>' +
    ' backup https://jobs.lever.co/acme/abc-def-ghi';

  const links = extractAtsUrlsFromText(html);
  assert("extracts greenhouse URL", links.some((u) => /greenhouse\.io\/acme\/jobs\/123456/.test(u)));
  assert("extracts lever URL", links.some((u) => /lever\.co\/acme/.test(u)));

  const json =
    '{"applicationUrl":"https:\\/\\/jobs.ashbyhq.com\\/foo\\/bar-baz"}';
  const fromJson = extractAtsUrlsFromText(json);
  assert("extracts escaped JSON ashby URL", fromJson.some((u) => /ashbyhq\.com\/foo/.test(u)));

  const picked = pickFirstAtsUrl(
    "https://himalayas.app/companies/x/jobs/y",
    "See https://boards.greenhouse.io/stripe/jobs/999"
  );
  assert("pickFirstAtsUrl prefers ATS in later candidate", /stripe/.test(picked || ""));

  const direct = pickFirstAtsUrl("https://boards.greenhouse.io/co/jobs/1");
  assert("pickFirstAtsUrl returns direct ATS", detectAts(direct)?.type === "greenhouse");
}

async function runLiveTests(urls) {
  console.log("\nLive resolution\n");
  for (const url of urls) {
    console.log(`\n→ ${url}`);
    const result = await resolveApplyUrl(url, { forceFetch: true });
    if (result) {
      console.log(
        `  resolved: ${result.resolvedUrl} (${result.ats?.type}, via ${result.via || result.source})`
      );
    } else {
      console.log("  (no ATS URL found)");
    }
  }
}

async function main() {
  runUnitTests();

  const args = process.argv.slice(2);
  const liveIdx = args.indexOf("--live");
  const liveUrls =
    liveIdx >= 0
      ? args.slice(liveIdx + 1).filter(Boolean)
      : [
          "https://himalayas.app/companies/pavago/jobs/software-engineer-6481762616",
        ];

  if (liveIdx >= 0 || process.env.RESOLVE_TEST_LIVE === "1") {
    await runLiveTests(liveUrls);
  } else {
    console.log("\nSkip live fetch (pass --live URL or RESOLVE_TEST_LIVE=1)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
