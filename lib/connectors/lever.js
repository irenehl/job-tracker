const BASE = "https://api.lever.co/v0/postings";

async function fetchLeverJobs(site) {
  const url = `${BASE}/${encodeURIComponent(site)}?mode=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Lever ${site}: HTTP ${res.status}`);
  }
  const jobs = await res.json();
  return (Array.isArray(jobs) ? jobs : []).map((job) => normalizeLeverJob(job, site));
}

function normalizeLeverJob(job, site) {
  const location =
    job.categories?.location ||
    [job.categories?.allLocations, job.workplaceType].filter(Boolean).join(", ") ||
    "";
  const desc = job.descriptionPlain || job.description || "";

  return {
    source: "lever",
    externalId: job.id || "",
    company: job.company || site,
    title: job.text || job.title || "",
    location,
    remote: /remote/i.test(location) || job.workplaceType === "remote",
    url: job.hostedUrl || job.applyUrl || "",
    postedAt: job.createdAt || null,
    description: desc,
    jobText: buildJobText(job, desc, location),
  };
}

function buildJobText(job, desc, location) {
  return [
    `Title: ${job.text || job.title}`,
    `Company: ${job.company || ""}`,
    `Location: ${location}`,
    "",
    desc,
  ].join("\n");
}

module.exports = { fetchLeverJobs, normalizeLeverJob };
