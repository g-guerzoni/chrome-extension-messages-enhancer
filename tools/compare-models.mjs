// Compares OpenRouter models on the extension's real prompt: cost, speed and the enhanced text.
//
//   OPENROUTER_API_KEY=sk-or-... node tools/compare-models.mjs [model ...]
//
// Without arguments it tries the candidates below. Reasoning is turned off where the model allows it
// (as the extension does) and retried without the setting when a model refuses it.

import { readFile } from "node:fs/promises";
import { buildSystemMessage } from "../src/scripts/prompt.js";

const CANDIDATES = [
  "x-ai/grok-4.3",
  "google/gemini-3.1-flash-lite",
  "openai/gpt-5.4-nano",
  "anthropic/claude-haiku-4.5",
  "google/gemini-2.5-flash-lite",
];

// Typical inputs: typos, English written with Portuguese structure, a Portuguese message to translate,
// an email, and a mention to keep.
const SAMPLES = [
  { tone: "neutral", type: "message", translate: false, text: "hi team quick update, release is on track for thurs. i fixed teh login bug and remaining QA items shoud be done by tomorow afternoon lmk if any questions" },
  { tone: "neutral", type: "message", translate: false, text: "I need that you send me the report until friday because I have to present it for the director, any doubt I stay at disposal" },
  { tone: "neutral", type: "message", translate: true, text: "oi pessoal, consegui reproduzir o bug do login, parece que é cache do navegador. vou subir o fix hoje a tarde, alguem consegue revisar?" },
  { tone: "formal", type: "email", translate: false, text: "hey, just wanted to check if you got the contract i sent last week. we need it signed by friday otherwise the project start gets pushed. thanks" },
  { tone: "neutral", type: "message", translate: false, text: "@ana can u check the deploy doc its urgent, link is https://example.com/deploy and the channel is #release" },
];

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY to your OpenRouter key.");
  process.exit(1);
}

const root = new URL("../src/config/", import.meta.url);
const instructions = JSON.parse(await readFile(new URL("instructions.json", root), "utf8"));
const { providers } = JSON.parse(await readFile(new URL("config.json", root), "utf8"));
const models = process.argv.slice(2).length ? process.argv.slice(2) : CANDIDATES;

async function complete(model, sample, reasoningOff = true) {
  const body = {
    model,
    messages: [
      { role: "system", content: buildSystemMessage(instructions, sample.tone, sample.type, sample.translate) },
      { role: "user", content: sample.text },
    ],
    max_tokens: 2000,
    temperature: 0.3,
    usage: { include: true },
    ...providers.openrouter.params,
    ...(reasoningOff ? { reasoning: { effort: "none" } } : {}),
  };
  const startedAt = Date.now();
  const response = await fetch(providers.openrouter.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...providers.openrouter.headers },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message ?? `HTTP ${response.status}`;
    if (reasoningOff && /reasoning|effort/i.test(message)) return complete(model, sample, false);
    throw new Error(message);
  }
  return {
    ms: Date.now() - startedAt,
    text: data.choices?.[0]?.message?.content?.trim() ?? "",
    cost: data.usage?.cost ?? null,
    tokens: data.usage?.completion_tokens ?? null,
    reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    reasoningOff,
  };
}

const summary = [];
for (const model of models) {
  console.log(`\n=== ${model}`);
  let totalMs = 0;
  let totalCost = 0;
  let failures = 0;
  for (const [i, sample] of SAMPLES.entries()) {
    try {
      const r = await complete(model, sample);
      totalMs += r.ms;
      totalCost += r.cost ?? 0;
      console.log(`\n[${i + 1}] ${(r.ms / 1000).toFixed(1)} s · $${r.cost?.toFixed(6) ?? "?"} · ${r.tokens} tokens (${r.reasoningTokens} reasoning${r.reasoningOff ? "" : ", could not turn off"})`);
      console.log(r.text);
    } catch (error) {
      failures++;
      console.log(`\n[${i + 1}] FAILED: ${error.message}`);
    }
  }
  const ok = SAMPLES.length - failures;
  summary.push({
    model,
    "avg seconds": ok ? +(totalMs / ok / 1000).toFixed(2) : "-",
    "cost per 1,000 messages ($)": ok ? +((totalCost / ok) * 1000).toFixed(3) : "-",
    failures,
  });
}

console.log("\n");
console.table(summary);
console.log("Read the outputs above to judge quality: typos fixed, awkward phrasing rewritten, meaning kept, @mentions, #channels and links untouched.");
