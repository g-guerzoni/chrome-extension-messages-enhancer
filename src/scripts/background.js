import { loadConfig, getActiveModel, getApiKeys, getPrefs, hasDataConsent } from "./shared.js";

const CONTEXT_MENU_ID = "enhance-selection";
const CONTENT_SCRIPT = "src/scripts/content.js";

// Menus are not restored when the extension is re-enabled, so recreate them on every worker start.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Enhance with AI Message Enhancer",
    contexts: ["editable"],
  });
});

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  await migrateStorage().catch((error) => debug("Storage migration failed:", error));

  // New installs and upgrades from v2 must see the data notice before any text is sent.
  const upgradedFromV2 = reason === "update" && Number.parseInt(previousVersion, 10) < 3;
  if ((reason === "install" || upgradedFromV2) && !(await hasDataConsent())) {
    chrome.runtime.openOptionsPage();
  }
});

// v3 moved secrets and message text out of sync storage and introduced multiple providers.
async function migrateStorage() {
  const legacy = await chrome.storage.sync.get(["openaiApiKey", "openaiModel", "translateEnabled", "persistedInputText", "persistedOutputText", "prefs"]);
  const current = await chrome.storage.local.get(["apiKeys", "model"]);
  const { models } = await loadConfig();
  const local = {};

  // The synced v2 key stays in place for devices still on v2; settings remove it on the next save.
  if (legacy.openaiApiKey && !current.apiKeys?.openai) {
    local.apiKeys = { ...current.apiKeys, openai: legacy.openaiApiKey };
    // Existing users keep working on their OpenAI key until they pick another model.
    if (!current.model) {
      const known = models.models.some((m) => m.id === legacy.openaiModel);
      local.model = known ? legacy.openaiModel : models.legacyDefaultModel;
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
  // v2 leftovers: page text handed to the popup, and synced message text.
  await chrome.storage.local.remove(["pendingText", "pendingTimestamp", "autoEnhance", "fromWebsite"]);
  await chrome.storage.sync.remove(["translateEnabled", "persistedInputText", "persistedOutputText"]);
}

async function debug(...args) {
  const { debugMode } = await chrome.storage.sync.get("debugMode");
  if (debugMode) console.log("[Message Enhancer]", ...args);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhanceText") {
    enhanceText(request.data)
      .then((text) => sendResponse({ text }))
      .catch((error) => {
        debug("Enhancement failed:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (request.action === "openOptions") {
    chrome.runtime.openOptionsPage();
    return;
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
      if (controller.signal.aborted) return;
      debug("Enhancement failed:", error);
      port.postMessage({ error: error.message });
    }
  });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "enhance-field" && tab?.id) enhanceInTab(tab.id);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab?.id) enhanceInTab(tab.id, info.frameId);
});

// Tabs opened before the extension was installed or updated have no content script yet,
// so inject it on demand. The shortcut and the menu click grant activeTab for this.
async function enhanceInTab(tabId, frameId) {
  const message = { action: "enhanceActiveField" };
  const options = frameId === undefined ? {} : { frameId };
  try {
    await chrome.tabs.sendMessage(tabId, message, options);
  } catch {
    try {
      const target = frameId === undefined ? { tabId, allFrames: true } : { tabId, frameIds: [frameId] };
      await chrome.scripting.executeScript({ target, files: [CONTENT_SCRIPT] });
      await chrome.tabs.sendMessage(tabId, message, options);
    } catch (error) {
      debug("Could not reach the page:", error);
    }
  }
}

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
  if (!(await hasDataConsent())) throw new Error("Please review and accept the data notice in the extension settings first.");
  if (!apiKey) throw new Error(`${provider.name} API key not found. Please set it in the extension settings.`);

  const send = (stream) =>
    fetch(provider.endpoint, {
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
        stream,
        [provider.maxTokensParam]: config.limits.maxCompletionTokens,
        ...provider.params,
        ...model.params,
      }),
    });

  const startedAt = Date.now();
  let response = await send(true);
  if (response.status === 400) {
    // OpenAI only lets verified organizations stream some models; fall back to a single response.
    const message = await readApiError(response, provider);
    if (!/stream/i.test(message)) throw new Error(message);
    debug("Streaming refused, retrying without it:", message);
    response = await send(false);
  }
  if (!response.ok) throw new Error(await readApiError(response, provider));

  const isStream = response.headers.get("content-type")?.includes("text/event-stream");
  const result = isStream ? await readStream(response.body, onDelta) : readCompletion(await response.json(), onDelta);

  const { finishReason } = result;
  const output = result.output.trim();
  debug(`${model.id} answered in ${Date.now() - startedAt}ms (finish_reason: ${finishReason})`);

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

async function readStream(body, onDelta) {
  let output = "";
  let finishReason = null;

  for await (const chunk of readServerSentEvents(body)) {
    if (chunk.error) throw new Error(chunk.error.message || "The model stream failed.");
    const choice = chunk.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) {
      output += delta;
      onDelta(delta);
    }
    finishReason = choice?.finish_reason ?? finishReason;
  }
  return { output, finishReason };
}

function readCompletion(data, onDelta) {
  const choice = data.choices?.[0];
  const output = choice?.message?.content ?? "";
  if (output) onDelta(output);
  return { output, finishReason: choice?.finish_reason ?? null };
}

async function* readServerSentEvents(body) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    // Flush the last event even when the stream ends without a trailing newline.
    buffer += done ? "\n" : value;
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      // Lines starting with ":" are keep-alive comments (e.g. OpenRouter's "PROCESSING").
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        debug("Skipping a malformed stream event:", data);
        continue;
      }
      yield event;
    }
    if (done) return;
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
