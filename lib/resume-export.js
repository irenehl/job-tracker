const fs = require("fs");
const path = require("path");
const { normalizeTailoredResume } = require("./resume-tailor");
const {
  mergeLinksDisplayFromProfile,
  parseLinksDisplayLines,
  splitContactForHeader,
} = require("./resume-contact");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  AlignmentType,
  BorderStyle,
  LineRuleType,
  Tab,
  TabStopType,
  convertInchesToTwip,
} = require("docx");

const SEP = " - ";
const FONT = "Cambria";
const HALF_PT_BODY = 22;
const HALF_PT_SECTION = 28;
const HALF_PT_NAME = 40;

const TWIP_SECTION_BEFORE = 220;
const TWIP_SECTION_AFTER = 120;
const TWIP_AFTER_CONTACT = 80;
const TWIP_AFTER_META = 48;
const TWIP_AFTER_BULLET = 32;
const TWIP_ROLE_BEFORE = 160;

const BLACK = "000000";

const HEADER_FONT = FONT;
const HEADER_NAME_COLOR = BLACK;
const HEADER_MUTED_COLOR = "A6A6A6";
const HEADER_LINK_COLOR = "2F5496";
const HEADER_DOT = "\u00A0\u00B7\u00A0";
const TWIP_NAME_TO_HEADLINE = 200;
const TWIP_HEADLINE_TO_CONTACT = 96;

const TAB_RIGHT_EDGE = convertInchesToTwip(6.55);
const BULLET_INDENT = convertInchesToTwip(0.22);

function toUpperLabel(s) {
  return String(s || "").toUpperCase();
}

function parseLanguageRows(languagesLine) {
  const parts = String(languagesLine || "")
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    const m = part.match(/^(.+?)\s+-\s+(.+)$/);
    if (m) {
      out.push({ lang: m[1].trim(), level: m[2].trim() });
    } else {
      out.push({ lang: part, level: "" });
    }
  }
  return out;
}

function docxSectionBand(titleUpper) {
  return new Paragraph({
    spacing: { before: TWIP_SECTION_BEFORE, after: TWIP_SECTION_AFTER },
    border: {
      bottom: {
        color: BLACK,
        style: BorderStyle.SINGLE,
        size: 6,
        space: 1,
      },
    },
    children: [
      new TextRun({
        text: titleUpper,
        font: FONT,
        size: HALF_PT_SECTION,
        bold: true,
      }),
    ],
  });
}

function docxBodyRun(text, runOpts = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: HALF_PT_BODY,
    ...runOpts,
  });
}

function docxRoleDatesRow(roleLine, datesPart) {
  const children = [];
  if (datesPart) {
    children.push(
      new TextRun({
        font: FONT,
        size: HALF_PT_BODY,
        bold: true,
        children: [roleLine, new Tab()],
      }),
      docxBodyRun(datesPart)
    );
  } else {
    children.push(docxBodyRun(roleLine, { bold: true }));
  }
  return new Paragraph({
    tabStops: datesPart
      ? [{ type: TabStopType.RIGHT, position: TAB_RIGHT_EDGE }]
      : [],
    spacing: {
      before: TWIP_ROLE_BEFORE,
      after: datesPart ? TWIP_AFTER_META : TWIP_AFTER_BULLET,
    },
    children,
  });
}

function stripTrailingPunctFromUrl(url) {
  return String(url || "").trim().replace(/[),.;]+$/, "");
}

/** @returns {{ label: string, url: string } | { plain: string }} */
function parseLabeledUrlLine(line) {
  const trimmed = String(line).trim();
  const labeled = trimmed.match(/^([^:]+):\s*(https?:\/\/\S+)$/i);
  if (labeled) {
    return {
      label: labeled[1].trim(),
      url: stripTrailingPunctFromUrl(labeled[2]),
    };
  }
  const bare = trimmed.match(/\b(https?:\/\/[^\s]+)/i);
  if (bare) {
    return { label: "Link", url: stripTrailingPunctFromUrl(bare[1]) };
  }
  return { plain: trimmed };
}

function shortUrlForHeader(url) {
  const u = stripTrailingPunctFromUrl(url);
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "") + parsed.search;
    if (!path || path === "/") {
      return host;
    }
    return `${host}${path}`;
  } catch {
    return String(u).replace(/^https?:\/\//i, "");
  }
}

const HEADER_ROLE_TITLE = "Software Engineer";

function buildHeaderLinksDocxRuns(contactLine, linksDisplay) {
  const { emails } = splitContactForHeader(contactLine);
  const rows = parseLinksDisplayLines(linksDisplay);
  const out = [];
  let first = true;

  function sep() {
    out.push(
      new TextRun({
        text: HEADER_DOT,
        font: HEADER_FONT,
        size: HALF_PT_BODY,
        color: HEADER_MUTED_COLOR,
      })
    );
  }

  for (const email of emails) {
    if (!first) sep();
    first = false;
    out.push(
      new ExternalHyperlink({
        children: [
          new TextRun({
            text: email,
            font: HEADER_FONT,
            size: HALF_PT_BODY,
            color: HEADER_LINK_COLOR,
            style: "Hyperlink",
          }),
        ],
        link: `mailto:${email}`,
      })
    );
  }

  for (const row of rows) {
    const parsed = parseLabeledUrlLine(row);
    if (!first) sep();
    first = false;
    if ("plain" in parsed) {
      out.push(
        new TextRun({
          text: parsed.plain,
          font: HEADER_FONT,
          size: HALF_PT_BODY,
          color: HEADER_MUTED_COLOR,
        })
      );
      continue;
    }
    const display = shortUrlForHeader(parsed.url);
    out.push(
      new ExternalHyperlink({
        children: [
          new TextRun({
            text: display,
            font: HEADER_FONT,
            size: HALF_PT_BODY,
            color: HEADER_LINK_COLOR,
            style: "Hyperlink",
          }),
        ],
        link: parsed.url,
      })
    );
  }

  return out;
}

function appendResumeHeaderBlock(children, data) {
  const name = data.yourName || "Candidate";
  const contactLine = data.contactLine || "";
  const linksDisplay = data.linksDisplay || "";
  const { location } = splitContactForHeader(contactLine);
  const linkRuns = buildHeaderLinksDocxRuns(contactLine, linksDisplay);

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: TWIP_NAME_TO_HEADLINE },
      children: [
        new TextRun({
          text: name,
          font: HEADER_FONT,
          bold: true,
          size: HALF_PT_NAME,
          color: HEADER_NAME_COLOR,
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: {
        after: location ? TWIP_HEADLINE_TO_CONTACT : TWIP_AFTER_META,
      },
      children: [
        new TextRun({
          text: HEADER_ROLE_TITLE,
          font: HEADER_FONT,
          size: HALF_PT_BODY,
          color: HEADER_MUTED_COLOR,
        }),
      ],
    })
  );

  if (location) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: {
          after: linkRuns.length ? TWIP_HEADLINE_TO_CONTACT : TWIP_AFTER_CONTACT,
        },
        children: [
          new TextRun({
            text: location,
            font: HEADER_FONT,
            size: HALF_PT_BODY,
            color: HEADER_MUTED_COLOR,
          }),
        ],
      })
    );
  }

  if (linkRuns.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: TWIP_AFTER_CONTACT },
        children: linkRuns,
      })
    );
  }
}

function buildMarkdownLinksLine(contactLine, linksDisplay) {
  const { emails } = splitContactForHeader(contactLine);
  const parts = [];
  function sep() {
    if (parts.length) parts.push(" · ");
  }
  for (const email of emails) {
    sep();
    parts.push(`[${email}](mailto:${email})`);
  }
  for (const row of parseLinksDisplayLines(linksDisplay)) {
    const parsed = parseLabeledUrlLine(row);
    sep();
    if ("plain" in parsed) parts.push(parsed.plain);
    else parts.push(`[${shortUrlForHeader(parsed.url)}](${parsed.url})`);
  }
  return parts.join("");
}

function tailoredResumeToMarkdown(data) {
  const lines = [];
  lines.push(`# ${data.yourName || "Name"}`);
  lines.push(HEADER_ROLE_TITLE);
  lines.push("");
  const { location } = splitContactForHeader(data.contactLine || "");
  if (location) {
    lines.push(location);
    lines.push("");
  }
  const mdLinks = buildMarkdownLinksLine(
    data.contactLine || "",
    data.linksDisplay || ""
  );
  if (mdLinks) {
    lines.push(mdLinks);
    lines.push("");
  }
  lines.push("## PROFILE");
  lines.push(data.summary || "");
  lines.push("");
  lines.push("## EMPLOYMENT HISTORY");
  lines.push("");
  for (const exp of data.experience) {
    const role = [exp.title, exp.employer].filter(Boolean).join(", ");
    const meta = [exp.dates, exp.location].filter(Boolean).join(SEP);
    lines.push(`### ${role}${meta ? ` — ${meta}` : ""}`);
    for (const b of exp.bullets) {
      lines.push(`- ${b}`);
    }
    lines.push("");
  }
  if (data.projects?.length) {
    lines.push("## PROJECTS");
    lines.push("");
    for (const p of data.projects) {
      lines.push(`### ${p.name}`);
      for (const b of p.bullets) lines.push(`- ${b}`);
      lines.push("");
    }
  }
  if (data.education?.length) {
    lines.push("## EDUCATION");
    lines.push("");
    for (const ed of data.education) {
      const deg = (ed.degree || "").trim();
      const school = (ed.school || "").trim();
      const dates = ed.dates || "";
      lines.push(`### ${deg}${dates ? ` — ${dates}` : ""}`);
      if (school) lines.push(school);
      if (ed.detail) lines.push(ed.detail);
      lines.push("");
    }
  }
  lines.push("## SKILLS");
  lines.push(data.skills || "");
  lines.push("");
  if (data.languagesLine) {
    lines.push("## LANGUAGES");
    for (const { lang, level } of parseLanguageRows(data.languagesLine)) {
      if (level) {
        lines.push(`${lang} - ${level}`);
      } else {
        lines.push(lang);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

function buildDocxDocument(data) {
  const children = [];

  appendResumeHeaderBlock(children, data);

  children.push(
    new Paragraph({
      spacing: { before: 120, after: 60 },
      children: [docxBodyRun(toUpperLabel("PROFILE"), { bold: true })],
    }),
    new Paragraph({
      spacing: { after: TWIP_SECTION_AFTER },
      children: [docxBodyRun(data.summary || "")],
    })
  );

  children.push(docxSectionBand(toUpperLabel("EMPLOYMENT HISTORY")));

  for (const exp of data.experience) {
    const roleLine = [exp.title, exp.employer].filter(Boolean).join(", ");
    const datesPart = [exp.dates, exp.location].filter(Boolean).join(", ");

    children.push(docxRoleDatesRow(roleLine, datesPart));

    for (const b of exp.bullets) {
      children.push(
        new Paragraph({
          spacing: { after: TWIP_AFTER_BULLET },
          bullet: { level: 0 },
          children: [docxBodyRun(b)],
        })
      );
    }
  }

  if (data.projects?.length) {
    children.push(docxSectionBand(toUpperLabel("PROJECTS")));
    for (const p of data.projects) {
      children.push(docxRoleDatesRow(p.name, ""));
      for (const b of p.bullets) {
        children.push(
          new Paragraph({
            spacing: { after: TWIP_AFTER_BULLET },
            bullet: { level: 0 },
            children: [docxBodyRun(b)],
          })
        );
      }
    }
  }

  if (data.education?.length) {
    children.push(docxSectionBand(toUpperLabel("EDUCATION")));
    for (const ed of data.education) {
      const degree = (ed.degree || "").trim();
      const school = (ed.school || "").trim();
      const datesPart = (ed.dates || "").trim();
      const degreeWithComma = degree.endsWith(",") ? degree : degree ? `${degree},` : "";

      const eduChildren = [];
      if (datesPart) {
        eduChildren.push(
          new TextRun({
            font: FONT,
            size: HALF_PT_BODY,
            bold: true,
            children: [degreeWithComma, new Tab()],
          }),
          docxBodyRun(datesPart)
        );
      } else {
        eduChildren.push(docxBodyRun(degreeWithComma, { bold: true }));
      }
      children.push(
        new Paragraph({
          tabStops: datesPart
            ? [{ type: TabStopType.RIGHT, position: TAB_RIGHT_EDGE }]
            : [],
          spacing: { before: TWIP_ROLE_BEFORE, after: school || ed.detail ? TWIP_AFTER_META : TWIP_SECTION_AFTER },
          children: eduChildren,
        })
      );

      if (school) {
        children.push(
          new Paragraph({
            spacing: { after: ed.detail ? TWIP_AFTER_META : TWIP_SECTION_AFTER },
            children: [docxBodyRun(school)],
          })
        );
      }
      if (ed.detail) {
        children.push(
          new Paragraph({
            spacing: { after: TWIP_AFTER_BULLET },
            indent: { left: BULLET_INDENT },
            children: [docxBodyRun(ed.detail)],
          })
        );
      }
    }
  }

  children.push(docxSectionBand(toUpperLabel("SKILLS")));
  children.push(
    new Paragraph({
      spacing: { after: TWIP_SECTION_AFTER },
      children: [docxBodyRun(data.skills || "")],
    })
  );

  if (data.languagesLine) {
    children.push(docxSectionBand(toUpperLabel("LANGUAGES")));
    const langRows = parseLanguageRows(data.languagesLine);
    for (const { lang, level } of langRows) {
      const langText = level ? `${lang} - ${level}` : lang;
      children.push(
        new Paragraph({
          spacing: { after: TWIP_SECTION_AFTER },
          children: [docxBodyRun(langText)],
        })
      );
    }
  }

  const margin = convertInchesToTwip(0.75);

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: HALF_PT_BODY,
          },
          paragraph: {
            spacing: {
              line: 276,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: margin,
              right: margin,
              bottom: margin,
              left: margin,
            },
          },
        },
        children,
      },
    ],
  });
}

async function tailoredResumeToDocxBuffer(data) {
  const doc = buildDocxDocument(data);
  return Packer.toBuffer(doc);
}

async function writeTailoredResumeArtifacts(data, outputDir, opts = {}) {
  const profileMarkdown = opts.profileMarkdown || "";
  const linksMerged = profileMarkdown
    ? mergeLinksDisplayFromProfile(data.linksDisplay || "", profileMarkdown)
    : data.linksDisplay || "";

  const normalized = normalizeTailoredResume({
    yourName: data.yourName,
    contactLine: data.contactLine,
    targetHeadline: data.targetHeadline,
    summary: data.summary,
    skills: data.skills,
    experience: data.experience || [],
    projects: data.projects || [],
    education: data.education || [],
    linksDisplay: linksMerged,
    languagesLine: data.languagesLine,
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const mdPath = path.join(outputDir, "tailored-resume.md");
  const docxPath = path.join(outputDir, "tailored-resume.docx");

  fs.writeFileSync(mdPath, tailoredResumeToMarkdown(normalized), "utf8");
  const buf = await tailoredResumeToDocxBuffer(normalized);
  fs.writeFileSync(docxPath, buf);

  return { mdPath, docxPath };
}

module.exports = {
  tailoredResumeToMarkdown,
  buildDocxDocument,
  tailoredResumeToDocxBuffer,
  writeTailoredResumeArtifacts,
};
