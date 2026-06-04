const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_PATH =
  process.env.GMAIL_TOKEN_PATH || path.join(process.cwd(), "gmail-token.json");

function loadCredentials() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    return { clientId, clientSecret, refreshToken };
  }

  if (fs.existsSync(TOKEN_PATH)) {
    const data = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    return {
      clientId: data.client_id || process.env.GMAIL_CLIENT_ID,
      clientSecret: data.client_secret || process.env.GMAIL_CLIENT_SECRET,
      refreshToken: data.refresh_token,
    };
  }

  throw new Error(
    "Gmail not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env.local " +
      `or run OAuth once to create ${TOKEN_PATH}. See README.`
  );
}

function getGmailClient() {
  const { clientId, clientSecret, refreshToken } = loadCredentials();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function decodeBody(payload) {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  const parts = payload.parts || [];
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf8");
    }
  }
  for (const part of parts) {
    const nested = decodeBody(part);
    if (nested) return nested;
  }
  return "";
}

function getHeader(headers, name) {
  const h = (headers || []).find(
    (x) => x.name.toLowerCase() === name.toLowerCase()
  );
  return h?.value || "";
}

async function listRecentEmails({ maxResults = 10, query } = {}) {
  const gmail = getGmailClient();
  const q =
    query ||
    process.env.GMAIL_INBOX_QUERY ||
    'is:unread (interview OR application OR recruiter OR "thank you for applying" OR "next steps")';

  const list = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults,
  });

  const messages = list.data.messages || [];
  const emails = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });
    const payload = full.data.payload;
    const headers = payload.headers;
    emails.push({
      id: msg.id,
      from: getHeader(headers, "From"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      snippet: full.data.snippet || "",
      body: decodeBody(payload).slice(0, 8000),
    });
  }

  return emails;
}

function getOAuthUrl() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET for OAuth setup.");
  }
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3333/oauth2callback"
  );
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

async function exchangeCodeForToken(code) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3333/oauth2callback"
  );
  const { tokens } = await oauth2.getToken(code);
  const out = {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
  };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(out, null, 2));
  return out;
}

module.exports = {
  listRecentEmails,
  getOAuthUrl,
  exchangeCodeForToken,
  TOKEN_PATH,
};
