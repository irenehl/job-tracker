const { listRecentEmails, loadCredentials } = require("./gmail");
const {
  isNotionConfigured,
  queryRecentApplications,
  appendPageNotes,
} = require("./notion");
const { generateInboxBrief, formatBriefForTerminal } = require("./inbox-brief");
const { parseBoolEnv, parseIntEnv } = require("./env-utils");
const logger = require("./copilot-logger");
const { notify } = require("./notify");

function isGmailConfigured() {
  try {
    loadCredentials();
    return true;
  } catch {
    return false;
  }
}

async function runInbox() {
  if (!isNotionConfigured()) {
    throw new Error("Notion not configured");
  }
  if (!isGmailConfigured()) {
    logger.warn("Gmail skipped — set GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN");
    return { processed: 0, skipped: true };
  }

  const max = parseIntEnv("GMAIL_MAX_MESSAGES", 5);
  const emails = await listRecentEmails({ maxResults: max });
  const applications = await queryRecentApplications({
    days: parseIntEnv("NOTION_INBOX_DAYS", 60),
  });

  if (!emails.length) {
    logger.info("Inbox: no matching unread emails");
    return { processed: 0 };
  }

  let processed = 0;
  for (const email of emails) {
    const brief = await generateInboxBrief({ email, applications });
    const application = applications.find((a) => a.pageId === brief.matchedPageId);

    if (process.env.COPILOT_QUIET !== "1") {
      console.log(formatBriefForTerminal(brief, email, application));
    }

    const needsAction =
      brief.emailType === "interview" ||
      brief.emailType === "recruiter" ||
      (brief.confidence === "high" && brief.suggestedReply);

    if (needsAction) {
      notify(
        "Job tracker",
        `${email.subject.slice(0, 60)} — ${brief.summary?.slice(0, 80) || "See terminal/log"}`
      );
      logger.info(`Inbox [${brief.emailType}]: ${email.subject}`);
    }

    const append =
      process.env.INBOX_APPEND_NOTION === undefined
        ? true
        : parseBoolEnv("INBOX_APPEND_NOTION", false);
    if (append && brief.matchedPageId && brief.summary) {
      const stamp = new Date().toISOString().slice(0, 16);
      await appendPageNotes(
        brief.matchedPageId,
        `[${stamp} inbox] ${brief.summary}`
      );
    }

    processed++;
  }

  return { processed };
}

module.exports = { runInbox, isGmailConfigured };
