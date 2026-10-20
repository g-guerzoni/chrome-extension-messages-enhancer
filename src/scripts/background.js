import { loadConfig, getActiveModel, getApiKeys, getPrefs, hasDataConsent, resolveModel } from "./shared.js";

const CONTEXT_MENU_ID = "enhance-selection";
const CONTENT_SCRIPT = "src/scripts/content.js";

// Menus are not restored when the extension is re-enabled, so recreate them on every worker start.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Enhance with AI Message Enhancer…",
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

// v3 moved secrets and message text out of sync storage and switched to OpenRouter. The synced v2
// OpenAI key is left for devices still on v2; settings remove it on the next save.
async function migrateStorage() {
  const legacy = await chrome.storage.sync.get([
    "translateEnabled",
    "persistedInputText",
    "persistedOutputText",
    "prefs",
    "enableContentScript",
    "inPageTrigger",
  ]);
  const local = {};

  // v3 replaced the on/off icon setting with a three-way trigger; respect an explicit "off".
  if (legacy.enableContentScript === false && !legacy.inPageTrigger) {
    await chrome.storage.sync.set({ inPageTrigger: "off" });
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
  await chrome.storage.sync.remove(["translateEnabled", "persistedInputText", "persistedOutputText", "enableContentScript"]);
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

  // Only extension pages (the settings page), never content scripts, may test an unsaved key.
  if (request.action === "testConnection" && sender.url?.startsWith(chrome.runtime.getURL(""))) {
    testConnection(request.data)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (request.action === "openOptions") {
    chrome.runtime.openOptionsPage();
    return;
  }

  if (request.action === "getContentConfig") {
    getContentConfig().then(sendResponse);
    return true;
  }
});

async function getContentConfig() {
  const [{ config }, prefs, model, settings, commands] = await Promise.all([
    loadConfig(),
    getPrefs(),
    getActiveModel(),
    chrome.storage.sync.get(["inPageTrigger", "blockedDomains"]),
    chrome.commands.getAll(),
  ]);
  return {
    ...config.contentScript,
    prefs,
    modelName: model.name,
    inPageTrigger: settings.inPageTrigger ?? config.defaults.inPageTrigger,
    blockedDomains: settings.blockedDomains ?? "",
    shortcut: commands.find((c) => c.name === "enhance-field")?.shortcut ?? "",
  };
}

// The popup and the in-page popover stream through a port so they can render partial output
// and cancel by disconnecting.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "enhance" || port.sender?.id !== chrome.runtime.id) return;

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
  const message = { action: "openEnhancer" };
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

  const startedAt = Date.now();
  const response = await postCompletion(
    provider,
    apiKey,
    {
      model: model.id,
      messages: [
        { role: "system", content: buildSystemMessage(instructions, tone, type, translate) },
        { role: "user", content: text },
      ],
      stream: true,
      [provider.maxTokensParam]: config.limits.maxCompletionTokens,
      ...provider.params,
      ...model.params,
    },
    signal
  );

  const isStream = response.headers.get("content-type")?.includes("text/event-stream");
  const result = isStream ? await readStream(response.body, onDelta) : readCompletion(await response.json(), onDelta);

  const { finishReason } = result;
  const output = result.output.trim();
  debug(`${model.id} answered in ${Date.now() - startedAt}ms (finish_reason: ${finishReason})`);

  if (finishReason === "length") throw new Error("The response was cut off because it reached the token limit.");
  if (!output) throw new Error("The model returned an empty response. Try again or choose another model.");
  return output;
}

// Some models refuse part of a request (streaming, or turning reasoning off); retry once without it.
const REQUEST_FALLBACKS = [
  { match: /stream/i, apply: (body) => ({ ...body, stream: false }) },
  { match: /reasoning|effort/i, apply: ({ reasoning, ...body }) => body },
];

async function postCompletion(provider, apiKey, body, signal) {
  const send = (payload) =>
    fetch(provider.endpoint, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...provider.headers },
      body: JSON.stringify(payload),
    });

  let payload = body;
  let response = await send(payload);
  const used = new Set();
  while (response.status === 400) {
    const message = await readApiError(response, provider);
    const fallback = REQUEST_FALLBACKS.find((f) => !used.has(f) && f.match.test(message));
    if (!fallback) throw new Error(message);
    used.add(fallback);
    debug("Request refused, retrying without the refused option:", message);
    payload = fallback.apply(payload);
    response = await send(payload);
  }
  if (!response.ok) throw new Error(await readApiError(response, provider));
  return response;
}

// Checks the endpoint, the key and the model with a tiny request, using the settings form's values.
async function testConnection({ modelId, apiKey }) {
  const { config, models } = await loadConfig();
  const model = resolveModel(models, modelId);
  if (!model) throw new Error("Enter an OpenRouter model ID like vendor/model.");
  const provider = config.providers[model.provider];
  if (!apiKey) throw new Error(`Enter your ${provider.name} API key first.`);

  const startedAt = Date.now();
  const response = await postCompletion(provider, apiKey, {
    model: model.id,
    messages: [{ role: "user", content: "Reply with the word OK." }],
    stream: false,
    [provider.maxTokensParam]: 64,
    ...provider.params,
    ...model.params,
  });
  const data = await response.json();
  if (!data.choices?.length) throw new Error(data.error?.message || "The model answered without a result.");
  return { model: data.model ?? model.id, ms: Date.now() - startedAt };
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
