const {
  extractGreenhouseJobs,
  fetchGreenhouseJobs,
} = require("../lib/connectors/greenhouse");

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

async function assertRejects(label, fn) {
  try {
    await fn();
    assert(label, false);
  } catch {
    assert(label, true);
  }
}

const sampleJob = {
  id: 123,
  title: "Software Engineer",
  company: { name: "Acme" },
  location: { name: "Remote" },
  absolute_url: "https://boards.greenhouse.io/acme/jobs/123",
  content: "Build reliable systems.",
  updated_at: "2026-01-01T00:00:00Z",
};

async function withMockFetch(response, fn) {
  const originalFetch = global.fetch;
  global.fetch = async () => response;
  try {
    await fn();
  } finally {
    global.fetch = originalFetch;
  }
}

async function main() {
  console.log("Greenhouse connector tests\n");

  assert(
    "extracts jobs from Greenhouse object response",
    extractGreenhouseJobs({ jobs: [sampleJob], meta: {} }).length === 1
  );
  assert(
    "keeps compatibility with array response",
    extractGreenhouseJobs([sampleJob]).length === 1
  );
  assert("returns empty list for malformed response", extractGreenhouseJobs({}).length === 0);

  await withMockFetch(
    {
      ok: true,
      json: async () => ({ jobs: [sampleJob], meta: {} }),
    },
    async () => {
      const jobs = await fetchGreenhouseJobs("acme");
      assert("normalizes fetched Greenhouse jobs", jobs[0]?.company === "Acme");
      assert("marks remote jobs from location", jobs[0]?.remote === true);
      assert("preserves absolute job URL", jobs[0]?.url === sampleJob.absolute_url);
    }
  );

  await withMockFetch(
    {
      ok: false,
      status: 404,
      json: async () => ({}),
    },
    async () => {
      await assertRejects("throws on non-OK Greenhouse responses", () =>
        fetchGreenhouseJobs("missing")
      );
    }
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
