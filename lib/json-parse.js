function parseJsonFromModel(text) {
  let s = String(text).trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) s = fence[1].trim();
  return JSON.parse(s);
}

module.exports = { parseJsonFromModel };
