const { fetchGreenhouseJobs } = require("./connectors/greenhouse");
const { fetchLeverJobs } = require("./connectors/lever");
const { fetchAshbyJobs } = require("./connectors/ashby");

function parseGreenhouseUrl(url) {
  const m = url.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i);
  if (m) return { board: m[1], jobId: m[2] };
  const m2 = url.match(/job-boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i);
  if (m2) return { board: m2[1], jobId: m2[2] };
  return null;
}

function parseLeverUrl(url) {
  const m = url.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/i);
  if (m) return { site: m[1], postingId: m[2] };
  return null;
}

function parseAshbyUrl(url) {
  const m = url.match(/jobs\.ashbyhq\.com\/([^/]+)\/([a-f0-9-]+)/i);
  if (m) return { board: m[1], jobId: m[2] };
  return null;
}

async function fetchJobFromUrl(url) {
  const trimmed = String(url).trim();

  const gh = parseGreenhouseUrl(trimmed);
  if (gh) {
    const jobs = await fetchGreenhouseJobs(gh.board);
    const job = jobs.find((j) => j.externalId === gh.jobId);
    if (!job) throw new Error(`Greenhouse job ${gh.jobId} not found on board ${gh.board}`);
    return { jobText: job.jobText, meta: job };
  }

  const lv = parseLeverUrl(trimmed);
  if (lv) {
    const jobs = await fetchLeverJobs(lv.site);
    const job = jobs.find((j) => j.externalId === lv.postingId || j.url === trimmed);
    if (!job) throw new Error(`Lever posting ${lv.postingId} not found on ${lv.site}`);
    return { jobText: job.jobText, meta: job };
  }

  const ash = parseAshbyUrl(trimmed);
  if (ash) {
    const jobs = await fetchAshbyJobs(ash.board);
    const job = jobs.find((j) => j.externalId === ash.jobId || j.url === trimmed);
    if (!job) throw new Error(`Ashby job ${ash.jobId} not found on ${ash.board}`);
    return { jobText: job.jobText, meta: job };
  }

  const res = await fetch(trimmed, {
    headers: { "User-Agent": "job-tracker/1.0" },
  });
  if (!res.ok) throw new Error(`Could not fetch URL: HTTP ${res.status}`);
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000);

  if (text.length < 200) {
    throw new Error(
      "URL not recognized as Greenhouse/Lever/Ashby and page had little text. Paste the job description instead."
    );
  }

  return {
    jobText: text,
    meta: { source: "url", url: trimmed, company: "", title: "" },
  };
}

module.exports = {
  fetchJobFromUrl,
  parseGreenhouseUrl,
  parseLeverUrl,
  parseAshbyUrl,
};
