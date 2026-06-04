const { completeJson } = require("./llm");
const { parseJsonFromModel } = require("./json-parse");

const BRIEF_SYSTEM = `You analyze recruiter/job application emails and match them to the candidate's application history.

Output JSON:
{
  "matchedPageId": "notion page id or null",
  "confidence": "high"|"medium"|"low",
  "emailType": "interview"|"rejection"|"acknowledgment"|"recruiter"|"other",
  "summary": "1-2 sentence summary of the email",
  "suggestedReply": "short draft reply or next action (empty if none needed)",
  "reasoning": "why this matches a specific application or not"
}

Use only provided applications list. Do not invent applications.`;

function buildBriefUserMessage({ email, applications }) {
  const appsJson = applications.map((a) => ({
    pageId: a.pageId,
    company: a.company,
    position: a.position,
    appliedDate: a.appliedDate,
    status: a.applicationStatus,
    notes: a.notes?.slice(0, 300),
    packetFolder: a.packetFolder,
  }));

  return `---EMAIL---
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Snippet: ${email.snippet}

Body:
${email.body.slice(0, 4000)}
---END EMAIL---

---APPLICATIONS---
${JSON.stringify(appsJson, null, 2)}
---END---`;
}

async function generateInboxBrief({ email, applications }) {
  const rawText = await completeJson({
    system: BRIEF_SYSTEM,
    user: buildBriefUserMessage({ email, applications }),
    maxTokens: Number.parseInt(process.env.INBOX_BRIEF_MAX_TOKENS || "1536", 10) || 1536,
  });

  return parseJsonFromModel(rawText);
}

function formatBriefForTerminal(brief, email, application) {
  const lines = [];
  lines.push(`Subject: ${email.subject}`);
  lines.push(`From: ${email.from}`);
  lines.push(`Type: ${brief.emailType || "other"} | Match: ${brief.confidence || "low"}`);
  lines.push("");

  if (application) {
    lines.push(
      `Application: ${application.position} @ ${application.company} (applied ${application.appliedDate || "?"})`
    );
    if (application.packetFolder) {
      lines.push(`Packet: ${application.packetFolder}`);
    }
    lines.push("");
  }

  lines.push(brief.summary || "");
  if (brief.suggestedReply) {
    lines.push("");
    lines.push("Suggested reply / next step:");
    lines.push(brief.suggestedReply);
  }
  if (brief.reasoning) {
    lines.push("");
    lines.push(`(${brief.reasoning})`);
  }

  return lines.join("\n");
}

module.exports = {
  generateInboxBrief,
  formatBriefForTerminal,
};
