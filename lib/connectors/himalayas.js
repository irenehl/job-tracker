const { pickFirstAtsUrl } = require("../ats-url-extract");

const SEARCH_BASE = "https://himalayas.app/jobs/api/search";

async function fetchHimalayasJobs({ query, limit = 20, page = 1 } = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page));
  params.set("sort", "recent");

  const url = `${SEARCH_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Himalayas search: HTTP ${res.status}`);
  }

  const data = await res.json();
  const jobs = Array.isArray(data.jobs) ? data.jobs : Array.isArray(data) ? data : [];

  return jobs.slice(0, limit).map((job) => normalizeHimalayasJob(job));
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHimalayasJob(job) {
  const desc =
    stripHtml(job.description) ||
    job.excerpt ||
    [job.title, job.companyName].filter(Boolean).join("\n");

  const aggregatorUrl =
    job.applicationLink ||
    job.guid ||
    (job.companySlug && job.title
      ? `https://himalayas.app/companies/${job.companySlug}/jobs/${slugify(job.title)}`
      : "");

  const url =
    pickFirstAtsUrl(job.applicationUrl, job.externalApplicationUrl, job.description) ||
    aggregatorUrl;

  return {
    source: "himalayas",
    externalId: String(job.id || job.slug || ""),
    company: job.companyName || job.company || "",
    title: job.title || "",
    location: job.location || "Remote",
    remote: true,
    url: job.applicationUrl || url,
    postedAt: job.pubDate || job.publishedAt || null,
    description: desc,
    jobText: buildJobText(job, desc),
  };
}

function buildJobText(job, desc) {
  return [
    `Title: ${job.title}`,
    `Company: ${job.companyName || job.company || ""}`,
    `Location: ${job.location || "Remote"}`,
    job.seniority ? `Seniority: ${job.seniority}` : "",
    "",
    desc,
  ]
    .filter(Boolean)
    .join("\n");
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = { fetchHimalayasJobs };
