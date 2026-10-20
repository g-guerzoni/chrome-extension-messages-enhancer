import { loadConfig, getApiKeys, formatPrice, applyTheme, setIcon, resolveModel, DATA_CONSENT_VERSION } from "./shared.js";

const CUSTOM_MODEL = "custom";

const modelSelect = document.getElementById("model");
const modelHelp = document.getElementById("model-help");
const customModelGroup = document.getElementById("custom-model-group");
const customModelInput = document.getElementById("custom-model");
const testButton = document.getElementById("test-connection");
const testResult = document.getElementById("test-result");
const apiKeysContainer = document.getElementById("api-keys");
const themeSelect = document.getElementById("theme");
const keepTextCheckbox = document.getElementById("keep-text");
const inPageTriggerSelect = document.getElementById("in-page-trigger");
const shortcutLabel = document.getElementById("shortcut");
const debugModeCheckbox = document.getElementById("debug-mode");
const blockedDomainsTextarea = document.getElementById("blocked-domains");
const saveButton = document.getElementById("save-btn");
const statusDiv = document.getElementById("status");
const dataNotice = document.getElementById("data-notice");
const consentStatus = document.getElementById("consent-status");
const consentButton = document.getElementById("consent-btn");

const { config, models } = await loadConfig();
const apiKeyInputs = {};
// Rough per-message cost: the system prompt plus a short message in, a similar message out.
const TYPICAL_TOKENS = { input: 1500, output: 150 };

let statusTimer = null;
let dirty = false;

document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

function renderModelOptions() {
  for (const model of models.models) {
    modelSelect.append(new Option(model.id === models.defaultModel ? `${model.name} (Recommended)` : model.name, model.id));
  }
  modelSelect.append(new Option("Other OpenRouter model…", CUSTOM_MODEL));
  customModelInput.placeholder = `e.g. ${models.customModel.example}`;
  document.getElementById("models-link").href = config.providers[models.customModel.provider].modelsUrl;
}

function renderApiKeyFields() {
  for (const [providerId, provider] of Object.entries(config.providers)) {
    const group = document.createElement("div");
    group.className = "form-group";

    const label = document.createElement("label");
    label.htmlFor = `api-key-${providerId}`;
    label.textContent = `${provider.name} API Key`;

    const wrapper = document.createElement("div");
    wrapper.className = "input-wrapper";
    const input = document.createElement("input");
    input.type = "password";
    input.id = `api-key-${providerId}`;
    input.placeholder = `${provider.keyPrefix}...`;
    input.autocomplete = "off";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toggle-password";
    toggle.title = "Show key";
    toggle.setAttribute("aria-pressed", "false");
    toggle.innerHTML = '<svg class="icon" aria-hidden="true"><use href="icons.svg#visibility_off"/></svg>';
    toggle.addEventListener("click", () => {
      const hidden = input.type === "text";
      input.type = hidden ? "password" : "text";
      toggle.title = hidden ? "Show key" : "Hide key";
      toggle.setAttribute("aria-pressed", String(!hidden));
      setIcon(toggle, hidden ? "visibility_off" : "visibility");
    });
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
    wrapper.append(input, toggle);

    const help = document.createElement("p");
    help.className = "help-text";
    const link = document.createElement("a");
    link.href = provider.keyUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Get a key";
    help.append(link, " · Stored only on this device.");

    group.append(label, wrapper, help);
    apiKeysContainer.append(group);
    apiKeyInputs[providerId] = input;
  }
}

function selectedModelId() {
  return modelSelect.value === CUSTOM_MODEL ? customModelInput.value.trim() : modelSelect.value;
}

function updateModelHelp() {
  const custom = modelSelect.value === CUSTOM_MODEL;
  customModelGroup.hidden = !custom;
  modelHelp.hidden = custom;
  testResult.textContent = "";
  if (custom) return;

  const model = models.models.find((m) => m.id === modelSelect.value);
  const { input, output } = model.pricing;
  const messagesPerDollar = Math.round(1e6 / (TYPICAL_TOKENS.input * input + TYPICAL_TOKENS.output * output));
  const estimate = `about ${messagesPerDollar.toLocaleString("en-US")} messages per $1`;
  modelHelp.textContent = [model.note, formatPrice(model.pricing), estimate].filter(Boolean).join(" · ");
}

function rejectCustomModel() {
  customModelInput.setAttribute("aria-invalid", "true");
  customModelInput.focus();
  showStatus(`Enter an OpenRouter model ID like ${models.customModel.example}.`, "error");
}

// Sends a tiny request with the values in the form, saved or not.
async function testConnection() {
  const model = resolveModel(models, selectedModelId());
  if (!model) return rejectCustomModel();
  const apiKey = apiKeyInputs[model.provider].value.trim();

  testButton.disabled = true;
  testResult.className = "test-result";
  testResult.textContent = "Testing…";
  const result = (await chrome.runtime
    .sendMessage({ action: "testConnection", data: { modelId: model.id, apiKey } })
    .catch(() => null)) ?? { error: "The extension did not answer. Reload it and try again." };
  testButton.disabled = false;
  testResult.className = `test-result ${result.error ? "error" : "success"}`;
  testResult.textContent = result.error
    ? `✗ ${result.error}`
    : `✓ Connected. ${result.model} answered in ${(result.ms / 1000).toFixed(1)} s.`;
}

function validateDomains(domainsString) {
  const errors = domainsString
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .flatMap((domain) => {
      if (domain.includes("://")) return [`"${domain}" - Remove protocol (http:// or https://)`];
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-./:]*[a-zA-Z0-9/])?$/.test(domain)) return [`"${domain}" - Invalid domain format`];
      return [];
    });
  return errors;
}

// Errors stay visible until the next save attempt; only success messages fade out.
function showStatus(message, type) {
  clearTimeout(statusTimer);
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  if (type === "success") statusTimer = setTimeout(() => (statusDiv.className = "status"), 3000);
}

function setDirty(value) {
  dirty = value;
  saveButton.textContent = value ? "Save changes •" : "Save Settings";
}

function rejectKey(providerId, message) {
  const input = apiKeyInputs[providerId];
  input.setAttribute("aria-invalid", "true");
  input.focus();
  showStatus(message, "error");
}

async function renderConsent() {
  const { dataConsent } = await chrome.storage.local.get("dataConsent");
  const accepted = dataConsent?.version === DATA_CONSENT_VERSION;

  dataNotice.classList.toggle("pending", !accepted);
  consentStatus.textContent = accepted
    ? `You accepted this on ${new Date(dataConsent.at).toLocaleDateString()}.`
    : "The extension sends nothing until you press OK.";
  consentButton.hidden = accepted;
}

async function acceptConsent() {
  await chrome.storage.local.set({ dataConsent: { version: DATA_CONSENT_VERSION, at: Date.now() } });
  renderConsent();
}

async function loadSettings() {
  const [settings, { model }, apiKeys] = await Promise.all([
    chrome.storage.sync.get(["theme", "keepTextOnClose", "inPageTrigger", "debugMode", "blockedDomains"]),
    chrome.storage.local.get("model"),
    getApiKeys(),
  ]);
  const { defaults } = config;

  const active = resolveModel(models, model) ?? resolveModel(models, models.defaultModel);
  modelSelect.value = active.custom ? CUSTOM_MODEL : active.id;
  customModelInput.value = active.custom ? active.id : "";
  themeSelect.value = settings.theme ?? defaults.theme;
  keepTextCheckbox.checked = settings.keepTextOnClose ?? defaults.keepTextOnClose;
  inPageTriggerSelect.value = settings.inPageTrigger ?? defaults.inPageTrigger;
  debugModeCheckbox.checked = settings.debugMode ?? defaults.debugMode;
  blockedDomainsTextarea.value = settings.blockedDomains ?? "";
  for (const [providerId, input] of Object.entries(apiKeyInputs)) input.value = apiKeys[providerId] ?? "";

  applyTheme(themeSelect.value);
  updateModelHelp();
}

async function saveSettings() {
  const model = resolveModel(models, selectedModelId());
  if (!model) return rejectCustomModel();
  const apiKeys = {};

  for (const [providerId, input] of Object.entries(apiKeyInputs)) {
    const key = input.value.trim();
    const provider = config.providers[providerId];
    if (!key) continue;
    if (!key.startsWith(provider.keyPrefix) || key.length < 20) {
      rejectKey(providerId, `Invalid ${provider.name} API key. It should start with "${provider.keyPrefix}".`);
      return;
    }
    apiKeys[providerId] = key;
  }

  if (!apiKeys[model.provider]) {
    rejectKey(model.provider, `${model.name} needs an API key from ${config.providers[model.provider].name}.`);
    return;
  }

  const blockedDomains = blockedDomainsTextarea.value.trim();
  const domainErrors = validateDomains(blockedDomains);
  if (domainErrors.length) {
    showStatus(`Invalid domain format: ${domainErrors.join(", ")}`, "error");
    return;
  }

  try {
    await Promise.all([
      chrome.storage.local.set({ apiKeys, model: model.id }),
      // v2 kept the OpenAI key in sync storage; it now lives in local storage only.
      chrome.storage.sync.remove(["openaiApiKey", "openaiModel"]),
      chrome.storage.sync.set({
        theme: themeSelect.value,
        keepTextOnClose: keepTextCheckbox.checked,
        inPageTrigger: inPageTriggerSelect.value,
        debugMode: debugModeCheckbox.checked,
        blockedDomains,
      }),
      keepTextCheckbox.checked || chrome.storage.local.remove(["persistedInputText", "persistedOutputText"]),
    ]);
    setDirty(false);
    showStatus("Settings saved.", "success");
  } catch (error) {
    showStatus(`Error saving settings: ${error.message}`, "error");
  }
}

renderModelOptions();
renderApiKeyFields();
modelSelect.addEventListener("change", updateModelHelp);
customModelInput.addEventListener("input", () => {
  customModelInput.removeAttribute("aria-invalid");
  testResult.textContent = "";
});
testButton.addEventListener("click", testConnection);
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
saveButton.addEventListener("click", saveSettings);
consentButton.addEventListener("click", acceptConsent);
// Extension pages may open chrome:// URLs through the tabs API, not through links.
document.getElementById("change-shortcut").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
chrome.commands.getAll().then((commands) => {
  shortcutLabel.textContent = commands.find((c) => c.name === "enhance-field")?.shortcut || "Not set";
});
document.querySelector("main").addEventListener("input", () => setDirty(true));
addEventListener("beforeunload", (event) => {
  if (dirty) event.preventDefault();
});
loadSettings();
renderConsent();
