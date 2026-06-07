const { parseJsonFromModel, extractFirstBalancedJson } = require("../lib/json-parse");

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

function assertThrows(label, fn) {
  try {
    fn();
    assert(label, false);
  } catch {
    assert(label, true);
  }
}

console.log("JSON parser tests\n");

assert(
  "parses plain JSON object",
  parseJsonFromModel('{"position":"Engineer"}').position === "Engineer"
);

assert(
  "parses full fenced JSON",
  parseJsonFromModel('```json\n{"company":"Acme"}\n```').company === "Acme"
);

assert(
  "parses embedded fenced JSON",
  parseJsonFromModel('Here is the result:\n```json\n{"score":88}\n```\nThanks.').score === 88
);

assert(
  "parses JSON with trailing prose",
  parseJsonFromModel('{"match":"Apply","reasons":["fit"]}\nDone.').match === "Apply"
);

assert(
  "extracts balanced arrays with braces in strings",
  extractFirstBalancedJson('prefix [{"text":"literal } bracket"}] suffix') ===
    '[{"text":"literal } bracket"}]'
);

assertThrows("throws when no JSON exists", () => parseJsonFromModel("no structured data"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
