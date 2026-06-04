const fs = require("fs");
const path = require("path");
const { parseGreenhouseUrl } = require("../fetch-job-url");

const APPLY_API = "https://boards-api.greenhouse.io/v1/boards";

function splitName(contact) {
  const first = contact.firstName || "Candidate";
  const last = contact.lastName || ".";
  return { first_name: first, last_name: last };
}

/**
 * Fetch public apply page HTML and list form field names (best-effort).
 */
async function discoverGreenhouseFields(board, jobId) {
  const pageUrl = `https://boards.greenhouse.io/${encodeURIComponent(board)}/jobs/${jobId}`;
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": "job-tracker-auto-apply/1.0" },
  });
  if (!res.ok) {
    return { pageUrl, fields: [], error: `HTTP ${res.status}` };
  }
  const html = await res.text();
  const names = new Set();
  const re = /name=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = m[1];
    if (
      n.startsWith("question_") ||
      ["first_name", "last_name", "email", "phone", "resume", "cover_letter"].includes(n)
    ) {
      names.add(n);
    }
  }
  return { pageUrl, fields: [...names], htmlLength: html.length };
}

function buildStandardPayload({ contact, packet, formAnswers }) {
  const { first_name, last_name } = splitName(contact);
  const payload = {
    first_name,
    last_name,
    email: contact.email,
    phone: contact.phone || String(formAnswers.phone || ""),
  };
  if (packet.coverLetter) {
    payload.cover_letter = packet.coverLetter.slice(0, 15000);
  }
  return payload;
}

/**
 * Greenhouse job board apply via boards-api (public forms only).
 * Custom question_* fields require manual apply until mapped.
 */
async function submitGreenhouseApply({
  applicationUrl,
  contact,
  packet,
  formAnswers,
  dryRun = true,
}) {
  const parsed = parseGreenhouseUrl(applicationUrl);
  if (!parsed) {
    return { ok: false, skipped: true, reason: "URL not a parseable Greenhouse job link" };
  }

  const { board, jobId } = parsed;
  const discovery = await discoverGreenhouseFields(board, jobId);
  const customFields = discovery.fields.filter((f) => f.startsWith("question_"));
  const standardOnly =
    customFields.length === 0 &&
    discovery.fields.some((f) => f === "email" || f === "first_name");

  const payload = buildStandardPayload({ contact, packet, formAnswers });
  const apiUrl = `${APPLY_API}/${encodeURIComponent(board)}/jobs/${jobId}`;
  const plan = {
    ats: "greenhouse",
    board,
    jobId,
    apiUrl,
    pageUrl: discovery.pageUrl,
    fieldsOnPage: discovery.fields,
    customQuestionCount: customFields.length,
    standardOnly,
    payloadKeys: Object.keys(payload),
    resumeFile: packet.resumeDocx,
  };

  if (customFields.length > 0) {
    return {
      ok: false,
      skipped: true,
      dryRun,
      reason: `Greenhouse form has ${customFields.length} custom question(s) — not auto-filled in Phase 1`,
      plan,
    };
  }

  if (!standardOnly && discovery.error) {
    return {
      ok: false,
      skipped: true,
      dryRun,
      reason: discovery.error || "Could not read apply form",
      plan,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      submitted: false,
      message: `Dry-run: would POST multipart to ${apiUrl}`,
      plan,
    };
  }

  const resumeBuf = fs.readFileSync(packet.resumeDocx);
  const form = new FormData();
  for (const [k, v] of Object.entries(payload)) {
    if (v) form.append(k, String(v));
  }
  form.append(
    "resume",
    new Blob([resumeBuf], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    path.basename(packet.resumeDocx)
  );

  const res = await fetch(apiUrl, {
    method: "POST",
    body: form,
    headers: { "User-Agent": "job-tracker-auto-apply/1.0" },
  });

  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    return {
      ok: false,
      submitted: false,
      reason: `Greenhouse API HTTP ${res.status}: ${bodyText.slice(0, 300)}`,
      plan,
    };
  }

  return {
    ok: true,
    dryRun: false,
    submitted: true,
    message: "Greenhouse application submitted",
    plan,
    responseSnippet: bodyText.slice(0, 200),
  };
}

module.exports = {
  submitGreenhouseApply,
  discoverGreenhouseFields,
  buildStandardPayload,
};
