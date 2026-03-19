# Job tracker

A small CLI that pastes a job posting, uses an LLM to extract **position**, **company**, **industry**, **notes**, and **interview study themes**, then optionally saves a row to a **Notion** database.

## Prerequisites

- **Node.js** (v18+ recommended)
- A **Notion** integration with access to your jobs database (see [Getting your Notion API key and database](#getting-your-notion-api-key-and-database) below)
- An API key for either **OpenAI** or **Anthropic**

## Install

```bash
cd job-tracker
npm install
```

## Getting your Notion API key and database

You need two values for `.env.local`: **`NOTION_API_KEY`** (from Notion) and **`NOTION_DATABASE_ID`** (from your jobs database URL).

### 1. Create an integration and copy the API key

1. Open **[Notion → My integrations](https://www.notion.so/my-integrations)** (log in if prompted).
2. Click **\+ New integration**.
3. Choose a **name** (e.g. “Job tracker”), your **workspace**, and create it.
4. On the integration page, open the **Secrets** (or **API key**) section and **copy the “Internal Integration Secret”**.  
   - It starts with `secret_` — this is your **`NOTION_API_KEY`**.  
   - Treat it like a password; never commit it to git (`.env.local` is ignored).

Optional: under **Capabilities**, ensure the integration can **read content** and **insert content** (defaults are usually enough for creating pages in a database).

### 2. Create your jobs database in Notion

1. In Notion, create a new page and add a **Database** → **Full page** (or use an existing database).
2. Add the columns listed in [Required database properties](#required-database-properties) below — names and types must match what the script expects.

### 3. Connect the integration to that database

The API can only see pages/databases you explicitly share with the integration.

1. Open the **database as a full page** (click its title so you’re viewing the database, not a tiny inline block).
2. Use **⋯** (three dots) in the top-right → **Connections** → **Connect to** → choose your integration  
   **or** use **Share** and add your integration (wording varies slightly in Notion; look for **Connections** / **Add connections**).

If this step is skipped, saves will fail with permission or “object not found” style errors.

### 4. Copy the database ID (`NOTION_DATABASE_ID`)

1. With the database open as a full page, copy the URL from the browser bar.  
   Example shape: `https://www.notion.so/workspace-name/<DATABASE_ID>?v=...`
2. The **database ID** is the **32-character** segment in the path (letters, numbers; often shown as a UUID with hyphens — you can use it **with or without hyphens** in env vars; Notion accepts both).
3. Put that value in **`NOTION_DATABASE_ID`** in `.env.local`.

Official overview: [Notion API — Getting started](https://developers.notion.com/docs/getting-started).

## Required database properties

The script expects these properties **with these exact names and types** (names are case-sensitive):

| Property            | Type        | Notes |
|---------------------|------------|--------|
| **Position**        | Title      | Job title |
| **Company**         | Rich text  | Employer |
| **Industry**        | Select     | The model picks a short label; add options that match what you expect, or add new options in Notion as needed |
| **Application Status** | **Status** | Must include a status named **`Applied`** (or set `NOTION_STATUS_APPLIED` to match your option) |
| **Applied**         | Date       | Set to today when saved |
| **Application Link**| URL        | Left empty by the script (fill in Notion if you want) |
| **Notes**           | Rich text  | Short summary from the model |
| **Study themes**    | Rich text  | Bullet list of prep topics (rename in Notion? Set `NOTION_PROPERTY_STUDY_THEMES` to match) |

## Configuration

1. Copy the example env file and edit it:

   ```bash
   cp .env.example .env.local
   ```

2. The app loads **`.env.local`** (and overrides any keys already set in your shell).

### Required variables

| Variable | Description |
|----------|-------------|
| `NOTION_API_KEY` | Notion integration secret (`secret_...`) |
| `NOTION_DATABASE_ID` | Target database ID |
| `LLM_PROVIDER` | `openai` or `anthropic` (default: `anthropic`) |
| `OPENAI_API_KEY` | If using OpenAI |
| `ANTHROPIC_API_KEY` | If using Anthropic |

### Optional variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI chat model |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Anthropic model |
| `NOTION_PROPERTY_STUDY_THEMES` | `Study themes` | Name of the rich text property for study topics |
| `NOTION_STUDY_THEMES_MAX_TOPICS` | `12` | Max number of study theme bullets |
| `NOTION_STATUS_APPLIED` | `Applied` | Status name used on save |
| `TRACK_JOB_DEBUG` | (off) | Set to `1` to print raw JSON from the model on stderr |

## Usage

Run from the project directory so `.env.local` is found.

### Paste from clipboard (macOS)

```bash
pbpaste | node track-job.js
```

### Pipe any text

```bash
cat job.txt | node track-job.js
```

### Inline job text

```bash
node track-job.js "Senior Engineer at ExampleCo — we use TypeScript, Postgres..."
```

### What happens

1. The script sends the text to the configured LLM and parses JSON: position, company, industry, notes, and `studyThemes` (technical interview prep topics).
2. It prints a preview in the terminal.
3. It asks **`Save to Notion? (y/n)`**.  
   - If you **piped** input (e.g. `pbpaste | ...`), the prompt still works by reading from your terminal (`/dev/tty`).
4. On **y**, it creates a new page in the database with **Application Status** set to **Applied** (or `NOTION_STATUS_APPLIED`) and **Applied** set to **today**.

## Tips

- **Enough text**: Very short input (&lt; ~40 characters) triggers a warning; the model needs real job description content, not empty clipboard or login-only pages.
- **Industry select**: If Notion rejects the save, the model’s industry string may not match any **Industry** select option—add that option in Notion or adjust the property.
- **Debug extraction issues**: `TRACK_JOB_DEBUG=1 node track-job.js "..."` to see the raw model output.

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| “No job description” / empty fields | Check clipboard: `pbpaste \| head -c 400` |
| “Extraction returned no usable fields” | Paste includes real job body, not only UI chrome |
| Notion API errors | Confirm integration is **shared** with the database; property names and types match the table above |
| Wrong LLM | Set `LLM_PROVIDER=openai` or `anthropic` and the matching API key |

## License

ISC (see `package.json`).
