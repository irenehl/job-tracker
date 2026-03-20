const { Client } = require("@notionhq/client");
const { formatStudyThemesForNotion } = require("./job-extraction");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_PROPERTY_STUDY_THEMES =
  process.env.NOTION_PROPERTY_STUDY_THEMES || "Study themes";

async function saveToNotion(data) {
  const today = new Date().toISOString().split("T")[0];
  const studyThemesContent = formatStudyThemesForNotion(data.studyThemes);

  const response = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      Position: {
        title: [{ text: { content: data.position } }],
      },
      Company: {
        rich_text: [{ text: { content: data.company } }],
      },
      Industry: data.industry
        ? { select: { name: data.industry } }
        : { select: null },
      "Application Status": {
        status: { name: process.env.NOTION_STATUS_APPLIED || "Applied" },
      },
      Applied: {
        date: { start: today },
      },
      "Application Link": {
        url: null,
      },
      Notes: {
        rich_text: [{ text: { content: data.notes } }],
      },
      [NOTION_PROPERTY_STUDY_THEMES]: studyThemesContent
        ? { rich_text: [{ text: { content: studyThemesContent } }] }
        : { rich_text: [] },
    },
  });

  return response.id;
}

module.exports = { saveToNotion, notion, DATABASE_ID };
