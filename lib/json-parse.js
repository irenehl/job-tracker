function parseJsonFromModel(text) {
  const source = String(text ?? "").trim();
  const candidates = buildJsonCandidates(source);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new SyntaxError("Model response did not contain JSON");
}

function buildJsonCandidates(source) {
  const candidates = [];
  const add = (value) => {
    const candidate = String(value ?? "").trim();
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };

  add(source);

  const fullFence = source.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fullFence) add(fullFence[1]);

  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    add(match[1]);
  }

  const balanced = extractFirstBalancedJson(source);
  if (balanced) add(balanced);

  return candidates;
}

function extractFirstBalancedJson(source) {
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== "{" && source[i] !== "[") continue;
    const candidate = readBalancedJsonFrom(source, i);
    if (candidate) return candidate;
  }
  return "";
}

function readBalancedJsonFrom(source, start) {
  const closingFor = { "{": "}", "[": "]" };
  const stack = [closingFor[source[start]]];
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(closingFor[char]);
    } else if (char === "}" || char === "]") {
      if (char !== stack[stack.length - 1]) return "";
      stack.pop();
      if (!stack.length) return source.slice(start, i + 1);
    }
  }

  return "";
}

module.exports = { parseJsonFromModel, extractFirstBalancedJson };
