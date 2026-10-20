import { loadConfig, getApiKeys, formatPrice, applyTheme } from "./shared.js";

const modelSelect = document.getElementById("model");
const modelHelp = document.getElementById("model-help");
const apiKeysContainer = document.getElementById("api-keys");
const themeSelect = document.getElementById("theme");
const keepTextCheckbox = document.getElementById("keep-text");
const contentScriptCheckbox = document.getElementById("content-script");
const debugModeCheckbox = document.getElementById("debug-mode");
const blockedDomainsTextarea = document.getElementById("blocked-domains");
const saveButton = document.getElementById("save-btn");
const statusDiv = document.getElementById("status");

const { config, models } = await loadConfig();
const apiKeyInputs = {};

document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

function renderModelOptions() {
  for (const [providerId, provider] of Object.entries(config.providers)) {
    const group = document.createElement("optgroup");
    group.label = provider.name;
    for (const model of models.models.filter((m) => m.provider === providerId)) {
      group.append(new Option(model.id === models.defaultModel ? `${model.name} (Recommended)` : model.name, model.id));
    }
    modelSelect.append(group);
  }
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
    toggle.title = toggle.ariaLabel = "Toggle key visibility";
    toggle.innerHTML = '<span class="material-icons" aria-hidden="true">visibility_off</span>';
    toggle.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      toggle.firstChild.textContent = input.type === "password" ? "visibility_off" : "visibility";
    });
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

function selectedModel() {
  return models.models.find((m) => m.id === modelSelect.value);
}

function updateModelHelp() {
  const model = selectedModel();
  modelHelp.textContent = [model.note, formatPrice(model.pricing)].filter(Boolean).join(" · ");
  for (const [providerId, input] of Object.entries(apiKeyInputs)) {
    input.required = providerId === model.provider;
  }
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

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  setTimeout(() => (statusDiv.className = "status"), 3000);
}

async function loadSettings() {
  const [settings, apiKeys] = await Promise.all([
    chrome.storage.sync.get(["model", "theme", "keepTextOnClose", "enableContentScript", "debugMode", "blockedDomains"]),
    getApiKeys(),
  ]);
  const { defaults } = config;

  modelSelect.value = models.models.some((m) => m.id === settings.model) ? settings.model : models.defaultModel;
  themeSelect.value = settings.theme ?? defaults.theme;
  keepTextCheckbox.checked = settings.keepTextOnClose ?? defaults.keepTextOnClose;
  contentScriptCheckbox.checked = settings.enableContentScript ?? defaults.enableContentScript;
  debugModeCheckbox.checked = settings.debugMode ?? defaults.debugMode;
  blockedDomainsTextarea.value = settings.blockedDomains ?? "";
  for (const [providerId, input] of Object.entries(apiKeyInputs)) input.value = apiKeys[providerId] ?? "";

  applyTheme(themeSelect.value);
  updateModelHelp();
}

async function saveSettings() {
  const model = selectedModel();
  const apiKeys = {};

  for (const [providerId, input] of Object.entries(apiKeyInputs)) {
    const key = input.value.trim();
    const provider = config.providers[providerId];
    if (!key) continue;
    if (!key.startsWith(provider.keyPrefix) || key.length < 20) {
      showStatus(`Invalid ${provider.name} API key. It should start with "${provider.keyPrefix}".`, "error");
      return;
    }
    apiKeys[providerId] = key;
  }

  if (!apiKeys[model.provider]) {
    showStatus(`${model.name} needs a ${config.providers[model.provider].name} API key.`, "error");
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
      chrome.storage.local.set({ apiKeys }),
      chrome.storage.sync.set({
        model: model.id,
        theme: themeSelect.value,
        keepTextOnClose: keepTextCheckbox.checked,
        enableContentScript: contentScriptCheckbox.checked,
        debugMode: debugModeCheckbox.checked,
        blockedDomains,
      }),
      keepTextCheckbox.checked || chrome.storage.local.remove(["persistedInputText", "persistedOutputText"]),
    ]);
    showStatus("Settings saved successfully!", "success");
  } catch (error) {
    showStatus(`Error saving settings: ${error.message}`, "error");
  }
}

renderModelOptions();
renderApiKeyFields();
modelSelect.addEventListener("change", updateModelHelp);
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
saveButton.addEventListener("click", saveSettings);
loadSettings();
