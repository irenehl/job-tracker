const BASE = "https://boards-api.greenhouse.io/v1/boards";

async function fetchGreenhouseJobs(boardToken) {
  const url = `${BASE}/${encodeURIComponent(boardToken)}/jobs?content=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Greenhouse ${boardToken}: HTTP ${res.status}`);
  }
  const data = await res.json();
  const jobs = extractGreenhouseJobs(data);
  return jobs.map((job) => normalizeGreenhouseJob(job, boardToken));
}

function extractGreenhouseJobs(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.jobs)) return data.jobs;
  return [];
}

function normalizeGreenhouseJob(job, boardToken) {
  const location = job.location?.name || job.offices?.map((o) => o.name).join(", ") || "";
  const desc =
    job.content ||
    [job.title, location, job.departments?.map((d) => d.name).join(", ")]
      .filter(Boolean)
      .join("\n");

  return {
    source: "greenhouse",
    externalId: String(job.id),
    company: job.company?.name || boardToken,
    title: job.title || "",
    location,
    remote: /remote/i.test(location),
    url: job.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${job.id}`,
    postedAt: job.updated_at || job.created_at || null,
    description: desc,
    jobText: buildJobText(job, desc),
  };
}

function buildJobText(job, desc) {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company?.name || ""}`,
    `Location: ${job.location?.name || ""}`,
    "",
    desc,
  ].join("\n");
}

module.exports = { fetchGreenhouseJobs, normalizeGreenhouseJob, extractGreenhouseJobs };
