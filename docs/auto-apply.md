# Auto-apply (Phase 1)

Automatic submission for high-confidence **Apply** jobs that already have a copilot **application packet** in `output/`.

## Safety model

| Gate | Behavior |
|------|----------|
| `AUTO_APPLY=1` | Master switch (default **off**) |
| `AUTO_APPLY_DRY_RUN=1` | Default **on** — logs plan, no HTTP submit |
| `AUTO_APPLY_LIVE=1` | Required with `AUTO_APPLY_DRY_RUN=0` to POST to ATS |
| Match | Only **`Apply`** (never Maybe/Skip) |
| Score | `>= AUTO_APPLY_MIN_SCORE` (default 75) |
| Red flags | Blocks if match reasons contain `⚠` |
| Profile | `validateMasterProfile` + email + name in profile header |
| Packet | `tailored-resume.docx`, `cover-letter.md`, `form-answers.json` |
| Work auth | `workAuthorization` in form-answers or clear mention in `## Preferences` |
| ATS | `AUTO_APPLY_ATS` (default `greenhouse` only for live submit) |

All steps log to `logs/copilot.log`.

## Enable (recommended path)

1. Keep copilot packet generation on (`AUTO_PACKET=1`).
2. In `.env.local`:

```bash
AUTO_APPLY=1
AUTO_APPLY_DRY_RUN=1
# AUTO_APPLY_MIN_SCORE=75
# AUTO_APPLY_BATCH=2
# AUTO_APPLY_ATS=greenhouse
# NOTION_STATUS_PACKET_READY=In progress
# NOTION_STATUS_APPLIED=Applied
```

3. Run one cycle and inspect logs:

```bash
npm run copilot:once
# or
npm run apply:dry
```

4. When dry-run output looks correct for a real Greenhouse **standard** form (no custom questions):

```bash
AUTO_APPLY_DRY_RUN=0
AUTO_APPLY_LIVE=1
npm run apply:dry   # still uses apply-job.js; set vars above first
```

## What is automated vs manual

| Automated (Phase 1) | Manual / not supported |
|---------------------|-------------------------|
| Confidence gate + Notion queue query | CAPTCHA, SSO, “create account” |
| Dry-run apply plan in logs | Lever / Ashby **live** submit |
| Greenhouse **standard** fields via `boards-api` POST | Custom `question_*` fields on Greenhouse |
| Notion → **Applied** after successful live submit | Aggregator pages that block fetch (some Himalayas listings) |
| Uses `form-answers.json` + tailored DOCX | File inputs beyond resume (portfolio uploads) |

## ATS APIs vs browsers

- **Greenhouse / Lever / Ashby connectors** (`lib/connectors/*`) only **list** jobs (public job-board APIs). There is **no** documented public “submit application” API for Lever/Ashby.
- **Greenhouse** public boards accept applications via `POST https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}` (multipart). Phase 1 uses this when the form has **no** custom questions.
- **Lever / Ashby** apply flows are SPA/login-heavy; Phase 1 returns `skipped` for live submit (dry-run still logs intent).

## CLI

```bash
# Process Notion queue (Packet ready + Apply + score)
AUTO_APPLY=1 node apply-job.js

# Single URL (must exist in Notion with packet folder)
AUTO_APPLY=1 node apply-job.js --url "https://boards.greenhouse.io/company/jobs/123"
```

## Notion workflow

1. Ingest → **Discovered** / **Not applied**
2. Auto-packet → **Packet ready** (`NOTION_STATUS_PACKET_READY`) + **Packet folder**
3. Auto-apply (live) → **Applied** + **Applied** date

Filter: **Match = Apply**, **Score ≥ 75**, **Status = Packet ready** (`NOTION_STATUS_PACKET_READY`, default `In progress`), **Packet folder** set.

Rows ingested before copilot columns existed may store Match/Score only in **Notes**; queries now read both columns and Notes metadata.

If the queue is empty after ingest, run **`npm run copilot:once`** first so auto-packet builds packets and moves status to **In progress**.

**Application Link should be a Greenhouse/Lever/Ashby URL.** Ingest resolves Himalayas/RemoteOK links when `RESOLVE_ATS_URLS=1` (default):

- **Himalayas:** HTML pages are Cloudflare-protected (403), so resolution uses the public search API (`?company=slug`) plus title matching on Greenhouse/Lever/Ashby public boards. Descriptions rarely contain ATS URLs. Expect ~25–40% auto-resolution for Himalayas-only rows; the rest need manual ATS links or configured boards.
- **RemoteOK:** fetched HTML / apply-page scrape (when not blocked).
- **Best practice:** set `GREENHOUSE_BOARDS=grafanalabs,bloomerang,pindropsecurity` (and `ASHBY_BOARDS=clipboard,mercor`) for companies you target — configured boards are searched first during Himalayas resolution and ingest pulls jobs with direct ATS URLs.

Known Himalayas slug → board aliases (built-in): `grafana-labs`→`grafanalabs`, `pindrop`→`pindropsecurity`, `clipboard-health`→`clipboard`, `work-mercor`→`mercor`.

```bash
# Verify URL extraction patterns
node scripts/test-resolve-apply-url.js

# Re-resolve existing Notion rows with aggregator Application Links
node scripts/backfill-apply-urls.js --dry-run
```

## Remaining gaps (Phase 2+)

- Map Greenhouse `question_*` IDs from HTML → LLM answers from profile
- Playwright fallback for Lever/Ashby and custom Greenhouse forms
- Store `redFlags` as a Notion column (today inferred from match reasons text)
- Rate limits / daily apply cap
- Human-in-the-loop approval webhook before `AUTO_APPLY_LIVE`
