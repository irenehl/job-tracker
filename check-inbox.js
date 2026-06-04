require("dotenv").config({ path: ".env.local", override: true });

const { getProvider } = require("./lib/llm");
const { runInbox } = require("./lib/inbox-runner");
const { green, red, dim } = require("./lib/terminal-style");

getProvider();

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    watch: args.includes("--watch"),
    oauth: args.includes("--oauth"),
    code: args.find((a, i) => args[i - 1] === "--code"),
  };
}

async function main() {
  const { watch, oauth, code } = parseArgs();

  if (oauth) {
    const { getOAuthUrl, exchangeCodeForToken, TOKEN_PATH } = require("./lib/gmail");
    if (code) {
      await exchangeCodeForToken(code);
      console.log(green(`Saved tokens to ${TOKEN_PATH}`));
      return;
    }
    console.log("Open URL, authorize, then:");
    console.log("  node check-inbox.js --oauth --code YOUR_CODE\n");
    console.log(getOAuthUrl());
    return;
  }

  if (watch) {
    const intervalMs =
      (Number.parseInt(process.env.GMAIL_POLL_MINUTES || "5", 10) || 5) * 60 * 1000;
    console.log(dim(`Inbox watch every ${intervalMs / 60000}m\n`));
    for (;;) {
      await runInbox();
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  await runInbox();
}

main().catch((err) => {
  console.error(red(err.message));
  process.exit(1);
});
