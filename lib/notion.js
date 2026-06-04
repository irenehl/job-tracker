const { Client } = require("@notionhq/client");
const { formatStudyThemesForNotion } = require("./job-extraction");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

const NOTION_PROPERTY_STUDY_THEMES =
  process.env.NOTION_PROPERTY_STUDY_THEMES || "Study themes";
const NOTION_PROPERTY_SCORE = process.env.NOTION_PROPERTY_SCORE || "Score";
const NOTION_PROPERTY_MATCH = process.env.NOTION_PROPERTY_MATCH || "Match";
const NOTION_PROPERTY_SOURCE = process.env.NOTION_PROPERTY_SOURCE || "Source";
const NOTION_PROPERTY_MATCH_REASONS =
  process.env.NOTION_PROPERTY_MATCH_REASONS || "Match reasons";
const NOTION_PROPERTY_PACKET_FOLDER =
  process.env.NOTION_PROPERTY_PACKET_FOLDER || "Packet folder";

const MATCH_TO_STATUS = {
  Apply: process.env.NOTION_STATUS_DISCOVERED || "Not applied",
  Maybe: process.env.NOTION_STATUS_DISCOVERED || "Not applied",
  Skip: process.env.NOTION_STATUS_SKIP || "Rejected",
};

let cachedDataSourceId = null;
let cachedPropertyNames = null;
let cachedStatusNames = null;
let warnedMissingCopilotProps = false;

function isNotionConfigured() {
  const key = process.env.NOTION_API_KEY;
  const db = process.env.NOTION_DATABASE_ID;
  return Boolean(
    key && db && String(key).trim() !== "" && String(db).trim() !== ""
  );
}

/** Notion SDK v5: query via dataSources, not databases.query */
async function getDataSourceId() {
  if (process.env.NOTION_DATA_SOURCE_ID) {
    return process.env.NOTION_DATA_SOURCE_ID.trim();
  }
  if (cachedDataSourceId) return cachedDataSourceId;

  const db = await notion.databases.retrieve({ database_id: DATABASE_ID });
  const id = db.data_sources?.[0]?.id;
  if (!id) {
    throw new Error(
      "Could not resolve Notion data source. Set NOTION_DATA_SOURCE_ID in .env.local " +
        "(open your database in Notion → … → Copy link, or retrieve database via API and copy data_sources[0].id)."
    );
  }
  cachedDataSourceId = id;
  return id;
}

async function queryDataSource(queryParams) {
  const data_source_id = await getDataSourceId();
  return notion.dataSources.query({
    data_source_id,
    ...queryParams,
  });
}

async function loadDataSourceSchema() {
  if (cachedPropertyNames && cachedStatusNames) {
    return { propertyNames: cachedPropertyNames, statusNames: cachedStatusNames };
  }

  const data_source_id = await getDataSourceId();
  const ds = await notion.dataSources.retrieve({ data_source_id });
  const props = ds.properties || {};

  cachedPropertyNames = new Set(Object.keys(props));
  const statusProp = props["Application Status"];
  cachedStatusNames = new Set(
    (statusProp?.status?.options || []).map((o) => o.name)
  );

  const copilotProps = [
    NOTION_PROPERTY_SOURCE,
    NOTION_PROPERTY_SCORE,
    NOTION_PROPERTY_MATCH,
    NOTION_PROPERTY_MATCH_REASONS,
    NOTION_PROPERTY_PACKET_FOLDER,
  ];
  const missing = copilotProps.filter((p) => !cachedPropertyNames.has(p));
  if (missing.length && !warnedMissingCopilotProps) {
    warnedMissingCopilotProps = true;
    console.warn(
      `[notion] Optional copilot columns not in your database: ${missing.join(", ")}. ` +
        `Score/Match will be appended to Notes. Add columns in Notion to filter by views.`
    );
  }

  return { propertyNames: cachedPropertyNames, statusNames: cachedStatusNames };
}

function hasProperty(name, propertyNames) {
  return propertyNames.has(name);
}

function resolveStatus(preferred, propertyNames, statusNames) {
  if (preferred && statusNames.has(preferred)) return preferred;
  const fallbacks = [
    preferred,
    process.env.NOTION_STATUS_DISCOVERED,
    "Not applied",
    "In progress",
    "Applied",
  ].filter(Boolean);
  for (const s of fallbacks) {
    if (statusNames.has(s)) return s;
  }
  return [...statusNames][0] || preferred;
}

function appendCopilotMetaToNotes(notes, data) {
  const parts = [String(notes || "").trim()];
  const meta = [];
  if (data.source) meta.push(`Source: ${data.source}`);
  if (data.match) meta.push(`Match: ${data.match}`);
  if (typeof data.score === "number") meta.push(`Score: ${data.score}`);
  if (meta.length) parts.push(`[copilot] ${meta.join(" | ")}`);
  if (data.matchReasons) parts.push(data.matchReasons);
  if (data.packetFolder) parts.push(`Packet: ${data.packetFolder}`);
  return parts.filter(Boolean).join("\n\n").slice(0, 2000);
}

function richText(content, maxLen = 2000) {
  const text = String(content ?? "").slice(0, maxLen);
  if (!text) return { rich_text: [] };
  return { rich_text: [{ text: { content: text } }] };
}

async function buildBaseProperties(data) {
  const { propertyNames, statusNames } = await loadDataSourceSchema();
  const studyThemesContent = formatStudyThemesForNotion(data.studyThemes || []);

  const useCopilotColumns =
    hasProperty(NOTION_PROPERTY_SOURCE, propertyNames) &&
    hasProperty(NOTION_PROPERTY_SCORE, propertyNames);

  let notesBody = data.notes;
  if (!useCopilotColumns) {
    notesBody = appendCopilotMetaToNotes(data.notes, data);
  }

  const props = {};

  if (hasProperty("Position", propertyNames)) {
    props.Position = {
      title: [{ text: { content: String(data.position || "").slice(0, 2000) } }],
    };
  }
  if (hasProperty("Company", propertyNames)) {
    props.Company = richText(data.company);
  }
  if (hasProperty("Industry", propertyNames)) {
    props.Industry = data.industry
      ? { select: { name: data.industry } }
      : { select: null };
  }
  if (hasProperty("Notes", propertyNames)) {
    props.Notes = richText(notesBody);
  }
  if (hasProperty(NOTION_PROPERTY_STUDY_THEMES, propertyNames)) {
    props[NOTION_PROPERTY_STUDY_THEMES] = studyThemesContent
      ? richText(studyThemesContent)
      : { rich_text: [] };
  }

  if (data.applicationUrl && hasProperty("Application Link", propertyNames)) {
    props["Application Link"] = { url: data.applicationUrl };
  }

  if (data.source && hasProperty(NOTION_PROPERTY_SOURCE, propertyNames)) {
    props[NOTION_PROPERTY_SOURCE] = { select: { name: data.source } };
  }

  if (
    typeof data.score === "number" &&
    !Number.isNaN(data.score) &&
    hasProperty(NOTION_PROPERTY_SCORE, propertyNames)
  ) {
    props[NOTION_PROPERTY_SCORE] = { number: data.score };
  }

  if (data.match && hasProperty(NOTION_PROPERTY_MATCH, propertyNames)) {
    props[NOTION_PROPERTY_MATCH] = { select: { name: data.match } };
  }

  if (
    data.matchReasons &&
    hasProperty(NOTION_PROPERTY_MATCH_REASONS, propertyNames)
  ) {
    props[NOTION_PROPERTY_MATCH_REASONS] = richText(data.matchReasons);
  }

  if (data.packetFolder && hasProperty(NOTION_PROPERTY_PACKET_FOLDER, propertyNames)) {
    props[NOTION_PROPERTY_PACKET_FOLDER] = richText(data.packetFolder);
  }

  if (data.applicationStatus && hasProperty("Application Status", propertyNames)) {
    const statusName = resolveStatus(data.applicationStatus, propertyNames, statusNames);
    props["Application Status"] = { status: { name: statusName } };
  }

  if (data.appliedDate && hasProperty("Applied", propertyNames)) {
    props.Applied = { date: { start: data.appliedDate } };
  }

  return props;
}

async function findPageByUrl(url) {
  if (!url || !isNotionConfigured()) return null;

  const normalized = String(url).trim();
  const response = await queryDataSource({
    filter: {
      property: "Application Link",
      url: { equals: normalized },
    },
    page_size: 1,
  });

  return response.results[0] || null;
}

async function createJobPage(data) {
  const { statusNames } = await loadDataSourceSchema();
  const today = new Date().toISOString().split("T")[0];
  const preferredStatus =
    data.applicationStatus ||
    (data.match ? MATCH_TO_STATUS[data.match] : null) ||
    process.env.NOTION_STATUS_APPLIED ||
    "Applied";
  const status = resolveStatus(preferredStatus, null, statusNames);

  const properties = await buildBaseProperties({
    ...data,
    applicationStatus: status,
    appliedDate:
      data.appliedDate || (status === "Applied" ? today : undefined),
  });

  const data_source_id = await getDataSourceId();
  const response = await notion.pages.create({
    parent: { data_source_id },
    properties,
  });

  return response.id;
}

async function updateJobPage(pageId, data) {
  const properties = await buildBaseProperties(data);
  await notion.pages.update({
    page_id: pageId,
    properties,
  });
  return pageId;
}

/**
 * Create or update a job page keyed by Application Link URL.
 */
async function upsertJobPage(data) {
  if (!data.applicationUrl) {
    return createJobPage(data);
  }

  const existing = await findPageByUrl(data.applicationUrl);
  if (existing) {
    await updateJobPage(existing.id, data);
    return { pageId: existing.id, created: false };
  }

  const pageId = await createJobPage(data);
  return { pageId, created: true };
}

async function appendPageNotes(pageId, text) {
  const block = {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: String(text).slice(0, 2000) } }],
    },
  };
  await notion.blocks.children.append({
    block_id: pageId,
    children: [block],
  });
}

/** @deprecated Use upsertJobPage — kept for minimal breakage */
async function saveToNotion(data) {
  const result = await upsertJobPage({
    position: data.position,
    company: data.company,
    industry: data.industry,
    notes: data.notes,
    studyThemes: data.studyThemes,
    applicationUrl: data.applicationUrl || null,
    source: data.source || "paste",
    score: data.score,
    match: data.match,
    matchReasons: data.matchReasons,
    applicationStatus: data.applicationStatus || process.env.NOTION_STATUS_APPLIED || "Applied",
    packetFolder: data.packetFolder,
  });
  return result.pageId;
}

async function queryRecentApplications({ limit = 50 } = {}) {
  const statuses = (
    process.env.NOTION_INBOX_STATUSES || "Applied,Interview"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const filters = statuses.length
    ? statuses.map((name) => ({
        property: "Application Status",
        status: { equals: name },
      }))
    : [];

  const response = await queryDataSource({
    filter:
      filters.length === 1
        ? filters[0]
        : filters.length > 1
          ? { or: filters }
          : undefined,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    page_size: Math.min(limit, 100),
  });

  return response.results.map((page) => pageToJobSummary(page));
}

async function queryJobsNeedingPacket({ minScore = 75, limit = 5 } = {}) {
  const { propertyNames, statusNames } = await loadDataSourceSchema();
  const discovered = resolveStatus(
    process.env.NOTION_STATUS_DISCOVERED || "Not applied",
    propertyNames,
    statusNames
  );

  const hasPacketCol = hasProperty(NOTION_PROPERTY_PACKET_FOLDER, propertyNames);

  // Match/Score live in dedicated columns for new rows; older ingest rows may only
  // have [copilot] metadata in Notes. Filter by status + empty packet, then gate in JS.
  let filter;
  if (hasPacketCol) {
    filter = {
      and: [
        { property: "Application Status", status: { equals: discovered } },
        { property: NOTION_PROPERTY_PACKET_FOLDER, rich_text: { is_empty: true } },
      ],
    };
  } else {
    filter = {
      and: [
        { property: "Application Status", status: { equals: discovered } },
        { property: "Notes", rich_text: { contains: "[copilot]" } },
        { property: "Notes", rich_text: { contains: "Match: Apply" } },
      ],
    };
  }

  const response = await queryDataSource({
    filter,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    page_size: Math.min(Math.max(limit * 4, 25), 100),
  });

  return response.results
    .map((page) =>
      enrichJobSummaryFromPage(page, { minScore, requireEmptyPacket: true })
    )
    .filter(Boolean)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

/**
 * Jobs with packet ready, Match=Apply, score threshold — for auto-apply.
 */
async function queryJobsReadyToApply({ minScore = 75, limit = 5 } = {}) {
  const { propertyNames, statusNames } = await loadDataSourceSchema();
  const packetReady = resolveStatus(
    process.env.NOTION_STATUS_PACKET_READY || "In progress",
    propertyNames,
    statusNames
  );

  const hasPacketCol = hasProperty(NOTION_PROPERTY_PACKET_FOLDER, propertyNames);

  let filter;
  if (hasPacketCol) {
    filter = {
      and: [
        { property: "Application Status", status: { equals: packetReady } },
        {
          or: [
            {
              property: NOTION_PROPERTY_PACKET_FOLDER,
              rich_text: { is_not_empty: true },
            },
            { property: "Notes", rich_text: { contains: "Packet:" } },
          ],
        },
      ],
    };
  } else {
    filter = {
      and: [
        { property: "Application Status", status: { equals: packetReady } },
        { property: "Notes", rich_text: { contains: "Match: Apply" } },
        { property: "Notes", rich_text: { contains: "Packet:" } },
      ],
    };
  }

  const response = await queryDataSource({
    filter,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    page_size: Math.min(Math.max(limit * 4, 25), 100),
  });

  return response.results
    .map((page) =>
      enrichJobSummaryFromPage(page, {
        minScore,
        requireEmptyPacket: false,
        requirePacketFolder: true,
      })
    )
    .filter(Boolean)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

function enrichJobSummaryFromPage(
  page,
  { minScore, requireEmptyPacket, requirePacketFolder }
) {
  const s = pageToJobSummary(page);
  const p = page.properties || {};
  s.score = p[NOTION_PROPERTY_SCORE]?.number ?? parseScoreFromNotes(s.notes);
  s.match = p[NOTION_PROPERTY_MATCH]?.select?.name || parseMatchFromNotes(s.notes);
  s.matchReasons =
    p[NOTION_PROPERTY_MATCH_REASONS]?.rich_text?.[0]?.plain_text || "";
  if (!s.packetFolder) {
    s.packetFolder =
      p[NOTION_PROPERTY_PACKET_FOLDER]?.rich_text?.[0]?.plain_text ||
      parsePacketFromNotes(s.notes) ||
      "";
  }

  if (requireEmptyPacket && s.packetFolder) return null;
  if (requirePacketFolder && !s.packetFolder) return null;
  if (s.match !== "Apply") return null;
  if (s.score === null || Number.isNaN(s.score) || s.score < minScore) return null;

  return s;
}

function parseScoreFromNotes(notes) {
  const m = String(notes || "").match(/Score:\s*(\d+)/i);
  return m ? Number.parseInt(m[1], 10) : null;
}

function parseMatchFromNotes(notes) {
  const m = String(notes || "").match(/Match:\s*(Apply|Maybe|Skip)/i);
  return m ? m[1] : "";
}

function parsePacketFromNotes(notes) {
  const m = String(notes || "").match(/Packet:\s*(.+)/i);
  return m ? m[1].trim().split("\n")[0].trim() : "";
}

function pageToJobSummary(page) {
  const p = page.properties || {};
  const title = p.Position?.title?.[0]?.plain_text || "";
  const company = p.Company?.rich_text?.[0]?.plain_text || "";
  const url = p["Application Link"]?.url || "";
  const status = p["Application Status"]?.status?.name || "";
  const applied = p.Applied?.date?.start || "";
  const notes = p.Notes?.rich_text?.[0]?.plain_text || "";
  const packetFolder =
    p[NOTION_PROPERTY_PACKET_FOLDER]?.rich_text?.[0]?.plain_text ||
    parsePacketFromNotes(notes) ||
    "";

  return {
    pageId: page.id,
    position: title,
    company,
    applicationUrl: url,
    applicationStatus: status,
    appliedDate: applied,
    notes: notes.slice(0, 500),
    packetFolder,
    score: p[NOTION_PROPERTY_SCORE]?.number ?? parseScoreFromNotes(notes),
    match: p[NOTION_PROPERTY_MATCH]?.select?.name || parseMatchFromNotes(notes),
    matchReasons:
      p[NOTION_PROPERTY_MATCH_REASONS]?.rich_text?.[0]?.plain_text || "",
  };
}

module.exports = {
  saveToNotion,
  upsertJobPage,
  findPageByUrl,
  createJobPage,
  updateJobPage,
  appendPageNotes,
  queryRecentApplications,
  queryJobsNeedingPacket,
  queryJobsReadyToApply,
  queryDataSource,
  getDataSourceId,
  pageToJobSummary,
  isNotionConfigured,
  notion,
  DATABASE_ID,
  NOTION_PROPERTY_PACKET_FOLDER,
};
