import { loadConfig, getActiveModel, getApiKeys, getPrefs } from "./shared.js";

const CONTEXT_MENU_ID = "enhance-selection";

chrome.runtime.onInstalled.addListener(() => {
  migrateStorage();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Enhance with AI Message Enhancer",
      contexts: ["editable"],
    });
  });
});

// v3 moved secrets and message text out of sync storage and introduced multiple providers.
async function migrateStorage() {
  const legacyKeys = ["openaiApiKey", "openaiModel", "translateEnabled", "persistedInputText", "persistedOutputText"];
  const legacy = await chrome.storage.sync.get([...legacyKeys, "model", "prefs"]);
  const { models } = await loadConfig();
  const local = {};

  if (legacy.openaiApiKey) {
    local.apiKeys = { ...(await getApiKeys()), openai: legacy.openaiApiKey };
    // Existing users keep working on their OpenAI key until they pick another model.
    if (!legacy.model) {
      const known = models.models.some((m) => m.id === legacy.openaiModel);
      await chrome.storage.sync.set({ model: known ? legacy.openaiModel : models.legacyDefaultModel });
    }
  }
  if (legacy.translateEnabled !== undefined && !legacy.prefs) {
    await chrome.storage.sync.set({ prefs: { translate: legacy.translateEnabled } });
  }
  if (legacy.persistedInputText || legacy.persistedOutputText) {
    local.persistedInputText = legacy.persistedInputText ?? "";
    local.persistedOutputText = legacy.persistedOutputText ?? "";
  }

  await chrome.storage.local.set(local);
  await chrome.storage.sync.remove(legacyKeys);
}

async function debug(...args) {
  const { debugMode } = await chrome.storage.sync.get("debugMode");
  if (debugMode) console.log("[Message Enhancer]", ...args);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhanceText") {
    enhanceText(request.data)
      .then((text) => sendResponse({ text }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (request.action === "getContentConfig") {
    loadConfig().then(({ config }) => sendResponse({ ...config.contentScript, maxCharacters: config.limits.maxCharacters }));
    return true;
  }
});

// The popup streams through a port so it can render partial output and cancel by closing.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "enhance") return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener(async (data) => {
    try {
      const text = await enhanceText(data, (delta) => port.postMessage({ delta }), controller.signal);
      port.postMessage({ done: true, text });
    } catch (error) {
      if (!controller.signal.aborted) port.postMessage({ error: error.message });
    }
  });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "enhance-field" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "enhanceActiveField" }).catch(() => {});
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "enhanceActiveField" }, { frameId: info.frameId }).catch(() => {});
  }
});

async function enhanceText({ text, ...overrides }, onDelta = () => {}, signal) {
  const [{ config, instructions }, model, apiKeys, prefs] = await Promise.all([
    loadConfig(),
    getActiveModel(),
    getApiKeys(),
    getPrefs(),
  ]);
  const provider = config.providers[model.provider];
  const apiKey = apiKeys[model.provider];
  const { tone, type, translate } = { ...prefs, ...overrides };

  if (!text?.trim()) throw new Error("Please enter some text to enhance.");
  if (text.length > config.limits.maxCharacters) {
    throw new Error(`Text is too long (max ${config.limits.maxCharacters} characters).`);
  }
  if (!apiKey) throw new Error(`${provider.name} API key not found. Please set it in the extension settings.`);

  const startedAt = Date.now();
  const response = await fetch(provider.endpoint, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...provider.headers,
    },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: "system", content: buildSystemMessage(instructions, tone, type, translate) },
        { role: "user", content: text },
      ],
      stream: true,
      [provider.maxTokensParam]: config.limits.maxCompletionTokens,
      ...provider.params,
      ...model.params,
    }),
  });

  if (!response.ok) throw new Error(await readApiError(response, provider));

  let output = "";
  let finishReason = null;
  for await (const chunk of readServerSentEvents(response.body)) {
    if (chunk.error) throw new Error(chunk.error.message || "The model stream failed.");
    const choice = chunk.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) {
      output += delta;
      onDelta(delta);
    }
    finishReason = choice?.finish_reason ?? finishReason;
  }

  debug(`${model.id} answered in ${Date.now() - startedAt}ms (finish_reason: ${finishReason})`);

  output = output.trim();
  if (finishReason === "length") throw new Error("The response was cut off because it reached the token limit.");
  if (!output) throw new Error("The model returned an empty response. Try again or choose another model.");
  return output;
}

async function readApiError(response, provider) {
  if (response.status === 401) return `Invalid ${provider.name} API key. Please check it in the extension settings.`;
  const body = await response.text();
  try {
    return JSON.parse(body).error?.message || `API request failed (${response.status}).`;
  } catch {
    // Gateways often answer with an HTML page; it is noise in the popup.
    const detail = body.trimStart().startsWith("<") ? response.statusText : body.slice(0, 200);
    return `API request failed (${response.status})${detail ? `: ${detail}` : "."}`;
  }
}

async function* readServerSentEvents(body) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) return;

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      // Lines starting with ":" are keep-alive comments (e.g. OpenRouter's "PROCESSING").
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      yield JSON.parse(data);
    }
  }
}

function buildSystemMessage(instructions, tone, type, shouldTranslate) {
  const bullets = (items) => items.map((item) => `- ${item}`);

  return [
    shouldTranslate ? instructions.baseTask.withTranslation : instructions.baseTask.default,
    ...bullets(shouldTranslate ? instructions.translation.enabled : instructions.translation.disabled),
    ...bullets(instructions.core),
    ...bullets(instructions.formatting),
    ...bullets(instructions.avoidance),
    ...bullets(instructions.tones[tone] ?? instructions.tones.neutral),
    ...(instructions.messageTypes[type] ?? instructions.messageTypes.message),
    ...instructions.final,
  ].join("\n");
}
