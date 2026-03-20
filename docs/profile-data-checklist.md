# Master profile data checklist

Use this when creating or updating `resume/master-profile.md`. The tailored resume generator may **only** use facts that appear here (see [cv-best-practices.md](cv-best-practices.md)). **Do not** add anything to the profile—or to a CV—that is not true.

For optional **job-specific** gap questions before each tailoring run, set `PROFILE_GAP_CHECK` (see [README.md](../README.md)) or answer the CLI prompt.

---

## Identity and contact

- What is your full name as it should appear on applications?
- What one-line **contact** string should export use: email, phone, city/region, **LinkedIn** URL, **portfolio/GitHub** if relevant? (Plain text; no markdown links in the line the tool emits.)
- Do you need **work authorization** or location constraints stated honestly (only if you want them on the CV)?

## Summary (`## Summary`)

- Do you have an explicit `## Summary` heading with 2–4 short sentences (role, strengths, domains—no buzzwords)?
- Does the summary reflect what you want **above the fold** for most roles you apply to?
- Write with **specific nouns and your own phrasing** where it stays professional—the tailor step mirrors this file, so a thin or generic summary here tends to read generic in exports (see *Professional, human tone* in [cv-best-practices.md](cv-best-practices.md)).

## Skills (`## Skills`)

- Which languages, frameworks, datastores, and platforms do you want **searchable** on tailored CVs? (List only what you can defend in an interview.)
- Any “familiar” vs “production” distinctions you want captured in words (still honest)?

## Experience (`## Experience`)

For **each** role, ask yourself:

- **Employer, title, dates** (and location or remote if you include it)—are they exact and consistent everywhere?
- **Stack:** What languages, frameworks, and infra did you use in that job?
- **Scope:** Team size, users, traffic, data volume, or product area—**only** if true and you are comfortable stating them.
- **Outcomes:** What changed because of your work (latency, reliability, revenue, adoption, defect rate)? **Add numbers only if they are real**; the validator ties metrics to this file.
- **Stakeholders:** Did you work with product, support, or non-technical partners in a way worth one concrete bullet?

## Projects (optional `## Projects`)

- Side projects, open source, or significant unpaid work that strengthen a target role—each with 1–3 bullets and tech?
- Skip this section if you have nothing substantial to add; do not pad.

## Education (`## Education`)

- Degree, school, dates; optional one line of relevant coursework or honors if it helps and is true.

## Certifications (optional `## Certifications`)

- Name, issuer, date—**only** credentials you hold.

## Community / other sections

- If you use non-standard sections (e.g. community leadership), ensure headings are clear and bullets are as concrete as experience bullets.

## Role-specific depth (add to profile only when true)

- **Spoken languages** for the role or market?
- **Security, compliance, or domain** (fintech, health, etc.) experience with specifics?
- **Leadership:** hiring, reviews, roadmap ownership—only with real examples?

---

## After you edit the profile

- Re-run tailoring for a sample job from [evaluation-sample-jobs.md](evaluation-sample-jobs.md) and confirm every metric on the output appears in the profile.
- Read the summary and top bullets aloud—they should sound human, not template-like ([cv-rubric.md](cv-rubric.md)).
