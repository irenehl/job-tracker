const fs = require("fs");
const readline = require("readline");
const { promptQuestion } = require("./terminal-style");

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

// Use /dev/tty when stdin is not a TTY (e.g. pbpaste | node …) so prompts still work.
function ask(question) {
  const pipedStdin = !process.stdin.isTTY;
  const input = pipedStdin ? fs.createReadStream("/dev/tty") : process.stdin;

  const rl = readline.createInterface({
    input,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      rl.close();
      if (pipedStdin && typeof input.destroy === "function") {
        input.destroy();
      }
    };

    rl.question(promptQuestion(question), (answer) => {
      cleanup();
      resolve((answer || "").trim().toLowerCase());
    });

    rl.on("error", (err) => {
      cleanup();
      reject(err);
    });
    input.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

function isAffirmative(answer) {
  const t = (answer || "").trim().toLowerCase();
  if (t === "") return true;
  return (
    t === "y" ||
    t === "ye" ||
    t === "yea" ||
    t === "yes" ||
    t === "yeah" ||
    t === "yep" ||
    t === "sure" ||
    t === "ok" ||
    t === "okay" ||
    t === "1" ||
    t === "true"
  );
}

module.exports = { readStdin, ask, isAffirmative };
