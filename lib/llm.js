const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");

function getProvider() {
  const p = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  if (p !== "openai" && p !== "anthropic") {
    throw new Error(
      `Invalid LLM_PROVIDER="${process.env.LLM_PROVIDER}". Use "openai" or "anthropic".`
    );
  }
  return p;
}

async function completeJson({
  system,
  user,
  maxTokens = 2048,
  modelOverride,
  temperature,
  topP,
}) {
  const provider = getProvider();
  let rawText;

  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Set OPENAI_API_KEY in .env.local (and LLM_PROVIDER=openai).");
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = modelOverride || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const params = {
      model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    if (typeof temperature === "number" && !Number.isNaN(temperature)) {
      params.temperature = temperature;
    }
    if (typeof topP === "number" && !Number.isNaN(topP)) {
      params.top_p = topP;
    }
    const completion = await openai.chat.completions.create(params);
    rawText = completion.choices[0]?.message?.content;
    if (!rawText) throw new Error("OpenAI returned empty content.");
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "Set ANTHROPIC_API_KEY in .env.local, or use LLM_PROVIDER=openai with OPENAI_API_KEY."
      );
    }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model =
      modelOverride || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    const anthropicParams = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    };
    if (typeof temperature === "number" && !Number.isNaN(temperature)) {
      anthropicParams.temperature = temperature;
    }
    if (typeof topP === "number" && !Number.isNaN(topP)) {
      anthropicParams.top_p = topP;
    }
    const message = await anthropic.messages.create(anthropicParams);
    const block = message.content[0];
    if (block.type !== "text") {
      throw new Error("Unexpected Anthropic response shape.");
    }
    rawText = block.text;
  }

  return rawText;
}

module.exports = {
  getProvider,
  completeJson,
};
