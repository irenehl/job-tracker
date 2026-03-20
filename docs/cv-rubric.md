# CV quality rubric (validator alignment)

Scores are **0–100** per category. The automated validator approximates this rubric with heuristics; it is not a guarantee of a specific commercial “ATS score.”

## Categories

### 1. ATS safety (`ats`)

| Score | Criteria |
|------:|----------|
| 90–100 | Single-column mental model; standard section names; no table-like or multi-column text; no problematic Unicode bullets or dash characters in tailored JSON strings (ASCII `-` only); predictable headings. |
| 70–89 | Minor issues (e.g. very dense lines, a few risky characters). |
| &lt; 70 | Table-like layout, pipes, tabs suggesting columns, or other parser-hostile patterns. |

### 2. Relevance (`relevance`)

| Score | Criteria |
|------:|----------|
| 90–100 | Skills and experience surface terminology that overlaps the job description where the **profile** supports those terms. |
| 70–89 | Reasonable overlap; some key job terms missing but not misleading. |
| &lt; 70 | Little overlap with job keywords **that also appear in the profile** (suggests weak tailoring or sparse profile). |

*Note:* The tool penalizes missing job terms only when those terms could have been used honestly (they appear in the master profile).

### 3. Grounding (`grounding`)

| Score | Criteria |
|------:|----------|
| 90–100 | Bullets and claims align with profile tokens; numbers in output appear in the profile. |
| 70–89 | Occasional low-overlap phrasing worth human review. |
| &lt; 70 | Multiple bullets with very low profile overlap or several numbers not found in the profile. |

Grounding checks run across **summary, headline, skills, experience, projects, and education** (experience bullets use the strictest overlap threshold).

### 4. Human tone (`tone`)

| Score | Criteria |
|------:|----------|
| 90–100 | No flagged clichés; varied bullet stems; professional concise phrasing. |
| 70–89 | One or two flags or repetitive openings. |
| &lt; 70 | Multiple cliché matches or heavy repetition. |

### 5. Clarity (`clarity`)

| Score | Criteria |
|------:|----------|
| 90–100 | Summary in a sensible length band; skills line substantive; bullets not excessively long. |
| 70–89 | Summary or skills a bit thin or bullets verbose. |
| &lt; 70 | Missing headline, very short summary/skills, or many bullets that look like duty-only stubs. |

## Severity for automation

- **OK**: export without revision; optional info messages only.
- **Revise once**: moderate issues (e.g. multiple tone or overlap warnings, relevance below threshold). Trigger a single LLM revision pass with validator feedback.
- **Fail (blocking)**: serious grounding problems, critical missing structure, or still failing after revision when `RESUME_STRICT=1`.

## Banned / flagged phrases (non-exhaustive)

Aligned with `lib/resume-validator.js` — extended lists live in code so prompts and checks stay in sync.

- Generic AI / marketing: “results-driven”, “passionate about”, “synergy”, “leverage”, “orchestrated”, “game-changer”, “proven track record”, “thought leader”, “world-class”, “impactful”, etc.
- Common resume-bot phrasing (validator flags these): “cross-functional”, “seamless/seamlessly”, “streamlined”, “spearhead”, “instrumental in”, “played a key/pivotal role”, “collaborated effectively”, “proficient in”, etc.
- First person: “I”, “my”, “me” referring to the candidate.

## Bullet quality heuristic

Strong bullets often use (when the profile allows):

**Action + scope + context/tools + outcome**

Not every line needs the full pattern—**mixed length** and **profile-grounded nouns** read more human than identical long “X, Y, and Z” stacks.

Weak patterns to flag:

- Starts with “Responsible for”, “Duties included”, “Worked on” without outcome.
- Very short generic line with no tool, scope, or result.
- **Tool-only one-liners** (e.g. “Developed APIs using NestJS”) with no scope, outcome, or profile-backed count — commercial checkers often ask for **quantifiable** lines; numbers must still come from the master profile.
- Vague quantity words (**multiple**, **several**, **various**) when the profile states a specific count — prefer that count.

The validator also warns when the **profile looks like it contains metrics** but **no experience bullet includes a digit**, so the tailor step can surface honest numbers.
