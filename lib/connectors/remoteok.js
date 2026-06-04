const { pickFirstAtsUrl } = require("../resolve-apply-url");

const API = "https://remoteok.com/api";

async function fetchRemoteOkJobs(limit = 30) {
  const res = await fetch(API, {
    headers: { "User-Agent": "job-tracker-copilot/1.0" },
  });
  if (!res.ok) {
    throw new Error(`RemoteOK: HTTP ${res.status}`);
  }

  const data = await res.json();
  const jobs = Array.isArray(data) ? data.filter((j) => j && j.id) : [];

  return jobs.slice(0, limit).map((job) => normalizeRemoteOkJob(job));
}

function normalizeRemoteOkJob(job) {
  const tags = Array.isArray(job.tags) ? job.tags.join(", ") : "";
  const desc = job.description || [job.position, job.company, tags].join("\n");
  const url =
    pickFirstAtsUrl(job.apply_url, job.url, job.description) ||
    job.apply_url ||
    job.url ||
    "";

  return {
    source: "remoteok",
    externalId: String(job.id),
    company: job.company || "",
    title: job.position || job.title || "",
    location: job.location || "Remote",
    remote: true,
    url,
    postedAt: job.date || null,
    description: desc,
    jobText: [
      `Title: ${job.position}`,
      `Company: ${job.company}`,
      `Location: ${job.location || "Remote"}`,
      tags ? `Tags: ${tags}` : "",
      "",
      desc,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

module.exports = { fetchRemoteOkJobs };
