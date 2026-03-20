# CV / resume best practices (project reference)

This document synthesizes common guidance from career centers and ATS-oriented sources into rules this tool follows. Use it when editing prompts, validators, or your master profile.

## Structure and scanability

- Put the most relevant evidence **above the fold**: headline, summary, then skills or experience depending on what the role emphasizes.
- Use **standard section titles** recruiters and parsers expect: Summary, Skills, Experience, Education, Projects (optional).
- Keep a **single-column** linear reading order. Avoid tables, text boxes, icons, multi-column layouts, and decorative graphics or icons that parsers may drop or mis-order. Simple **thin horizontal rules** (plain black lines) between blocks are fine when they are ordinary paragraph borders, not layout hacks.
- Use **short bullets** (ideally one to two lines). Each bullet should answer “why does this matter?” not only “what did you do?”

## Typography and generated `.docx` layout (this tool)

Tailored **`.docx`** output in `lib/resume-export.js` uses **Cambria** ~**11pt** body, **0.75in** margins, ~**1.15** line spacing, and **black** section bands for the main sections. The **top header** uses **Calibri**, **left-aligned** paragraphs: **large bold black name**, then **Software Engineer** (fixed gray title line), then **location only** on its own line (from `contactLine`, gray), then **one links row**—**email** and **`linksDisplay` URLs** as **blue hyperlinks** (host+path display text, **middle dots** between segments). **Phone numbers are omitted** from the generated header. There is **no separate `LINKS` section** in Word.

- **Header:** left-aligned text only (no shaded band or table).
- **PROFILE:** **`PROFILE`** label line, then the summary paragraph below (full width)—not a side-by-side label column.
- **Employment (and similar rows):** **job title and company on the left** (bold), **dates (and location if present) right-aligned** on the same row via a **right tab stop** (not a table). Bullets use a leading **ASCII hyphen** (`- `) and a hanging indent.
- **Education:** first line **degree** (bold, trailing comma) with **dates right-aligned**; **school** on the following line.
- **Skills:** **one flowing paragraph** after the **SKILLS** band (not a two-column skill grid).
- **Languages:** **LANGUAGES** section band, then **language** and **level** on **separate lines** when `languagesLine` uses `Language - Level` (or multiple entries separated by `;`).

**Section order:** EMPLOYMENT HISTORY → optional PROJECTS → EDUCATION → SKILLS → LANGUAGES.

**Markdown** (`tailored-resume.md`) mirrors the same flow and heading labels.

## Writing content

- Prefer **accomplishment-oriented** bullets: action verb + scope/context + tools + outcome when the profile supports it.
- Add **numbers only when they appear in the master profile** (or are clearly implied there). Do not invent metrics. Many resume tools flag bullets with **no quantifiable detail**—when your profile includes counts, percentages, team sizes, or scale, **put those into bullets** instead of vague “multiple” or tech-only one-liners.
- **Tailor** wording to the job: mirror terminology from the posting when it honestly matches your profile (e.g. “React” vs “React.js”). Avoid keyword stuffing or listing skills you do not have.
- **Spell out acronyms** on first use when helpful for readers outside your niche, then you may use the acronym.
- **Minimize vague soft claims** (“strong communicator”) unless tied to a concrete example in the profile.

## ATS (Applicant Tracking Systems)

- Many employers parse resumes into a database and match against the job description. **Simple Word-style structure** (headings + paragraphs + bullets) generally parses reliably; this project outputs Markdown + `.docx` with that model.
- **Keywords** from the job description matter, but they must reflect real experience documented in the master profile.
- **File format**: this repo generates `.docx` for uploads; some employers prefer PDF—export or convert as needed for a specific application.
- Avoid **headers/footers** for critical contact info (not applicable to our generator, but avoid adding them manually).

## Professional, human tone

- Sound like a careful editor, not a template: **concrete** details, **varied** bullet openings, no first person.
- Avoid generic AI / marketing clichés (see `docs/cv-rubric.md` and validator patterns).
- Use AI as a **drafting and tightening** layer: facts come from **you** (master profile), not from imagination.
- **Natural voice starts in the profile:** use specific product/company names, real numbers, and the same phrasing you would use in conversation where it is still professional. The tailor step mirrors that file—rich, human-shaped source text beats a sparse bullet list that forces the model to invent a polished tone.

## Length

- Early-career: often **one page**; experienced candidates may use **two** when every line adds relevance. The tailor step should **condense** older roles rather than pad.

## Master profile is the source of truth

The generator may only **select, reorder, rephrase, and emphasize** what is in `resume/master-profile.md`. Improving that file is the highest-leverage way to improve every tailored CV.

For a structured list of questions to capture missing facts (contact, metrics, projects, etc.), see **[profile-data-checklist.md](profile-data-checklist.md)**.

## Further reading (external)

- [UC San Diego Extended Studies — resume best practices](https://extendedstudies.ucsd.edu/news-events/extended-studies-blog/12-resume-best-practices-from-a-career-advisor-how-to-make-your-resume-stand-out-in-2025)
- [UC Berkeley School of Information — Resume basics](https://www.ischool.berkeley.edu/careers/guides/resume)
- [Johns Hopkins Imagine — ATS-friendly resume (Jobscan)](https://imagine.jhu.edu/resources/jobscan-how-to-create-an-ats-friendly-resume/)
- [Arcadia Career Launchpad — resume + AI tips](https://careerlaunchpad.arcadia.edu/blog/2025/02/26/how-to-make-a-resume-with-ai-tips-dos-and-donts/)
