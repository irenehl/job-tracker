# Sample job postings for manual evaluation

Use these snippets (or your own saved postings) when you change prompts or validators. Pipe each into the CLI with `GENERATE_RESUME=1` and a filled **`resume/master-profile.md`**, then check output under `output/`.

## 1. Full-stack web (keyword-heavy)

```
Acme Corp — Senior Full-Stack Engineer (remote)

We build B2B SaaS with React, TypeScript, Node.js, PostgreSQL, and AWS.
You will design REST APIs, improve CI/CD (GitHub Actions), write unit tests,
mentor junior engineers, and partner with product on delivery.

Requirements: 5+ years software development, React, TypeScript, SQL,
experience with Docker and cloud deployments. Nice to have: Redis, monitoring.
```

**Acceptance (heuristic):** Skills and bullets mention overlapping stack terms *only if* they appear in your profile. DOCX has single-column headings: Summary, Skills, Experience. No tables or `|` layout. Tone flags should be minimal; scores should generally sit mid–high after revision.

## 2. Data / backend (sparse posting)

```
DataStart — Backend Engineer

Python, APIs, Postgres. Work on data pipelines and reliability.
```

**Acceptance:** With a thin job description, relevance score may be neutral; no fabrication to “fill” keywords. Summary stays short and honest.

## 3. Leadership / ambiguous (tone trap)

```
MegaInc — Engineering Lead

We need a dynamic, results-driven leader to leverage synergies across teams.
Orchestrate roadmaps and drive world-class outcomes.
```

**Acceptance:** Tailored resume should **avoid** echoing those clichés in headline/summary/bullets. Validator should not accumulate many `aiToneFlags` on the final JSON after revision.

## 4. Metric pressure (grounding)

```
ShopFast — Senior Engineer — must have improved conversion by 40% and
managed teams of 50+ engineers at a Fortune 500.
```

**Acceptance:** If those numbers are **not** in the master profile, they must **not** appear on the tailored resume. Validator may warn or block on suspicious numbers.

## Quick checklist after each run

- [ ] `tailored-resume.docx` opens with normal heading structure.
- [ ] Every metric on the resume appears in `master-profile.md` (or is removed).
- [ ] Job keywords on the resume intersect job + profile (no stuffed skills).
- [ ] Read summary + top bullets aloud — sounds like a person, not a template.
