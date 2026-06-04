const BASE = "https://api.ashbyhq.com/posting-api/job-board";

async function fetchAshbyJobs(boardName) {
  const url = `${BASE}/${encodeURIComponent(boardName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Ashby ${boardName}: HTTP ${res.status}`);
  }
  const data = await res.json();
  const jobs = data.jobs || [];
  return jobs.map((job) => normalizeAshbyJob(job, boardName));
}

function normalizeAshbyJob(job, boardName) {
  const location = job.location || job.locationName || "";
  const desc =
    job.descriptionPlain ||
    job.descriptionHtml?.replace(/<[^>]+>/g, " ") ||
    "";

  return {
    source: "ashby",
    externalId: job.id || "",
    company: job.companyName || boardName,
    title: job.title || "",
    location,
    remote: job.isRemote || /remote/i.test(location),
    url: job.jobUrl || job.applyUrl || "",
    postedAt: job.publishedAt || null,
    description: desc,
    jobText: buildJobText(job, desc, location),
  };
}

function buildJobText(job, desc, location) {
  return [
    `Title: ${job.title}`,
    `Company: ${job.companyName || ""}`,
    `Location: ${location}`,
    "",
    desc,
  ].join("\n");
}

module.exports = { fetchAshbyJobs, normalizeAshbyJob };
