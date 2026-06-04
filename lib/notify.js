const { execSync } = require("child_process");

function notify(title, message) {
  if (process.env.COPILOT_NOTIFY !== "1") return;

  const safeTitle = String(title).replace(/"/g, '\\"').slice(0, 100);
  const safeMsg = String(message).replace(/"/g, '\\"').slice(0, 200);

  if (process.platform === "darwin") {
    try {
      execSync(
        `osascript -e 'display notification "${safeMsg}" with title "${safeTitle}"'`,
        { stdio: "ignore" }
      );
    } catch {
      /* ignore */
    }
  }
}

module.exports = { notify };
