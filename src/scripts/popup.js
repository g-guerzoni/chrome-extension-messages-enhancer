import { loadConfig, getActiveModel, getApiKeys, getPrefs, initTheme } from "./shared.js";

const inputText = document.getElementById("input-text");
const outputText = document.getElementById("output-text");
const enhanceBtn = document.getElementById("enhance-btn");
const copyBtn = document.getElementById("copy-btn");
const cleanBtn = document.getElementById("clean-btn");
const settingsBtn = document.getElementById("settings-btn");
const charCount = document.getElementById("char-count");
const charLimit = document.getElementById("char-limit");
const translateCheckbox = document.getElementById("translate");
const optionInputs = document.querySelectorAll(".options-section input");
const errorMessage = document.getElementById("error-message");
const statusAnnouncer = document.getElementById("status-announcer");
const modelName = document.getElementById("model-name");
const shortcutHint = document.getElementById("shortcut-hint");

let keepTextOnClose = true;
let errorTimer = null;

function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const debouncedSaveText = debounce(saveText, 500);

inputText.addEventListener("input", () => {
  updateCharCount();
  debouncedSaveText();
});
inputText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    enhanceText();
  }
});
enhanceBtn.addEventListener("click", enhanceText);
copyBtn.addEventListener("click", copyToClipboard);
cleanBtn.addEventListener("click", cleanAllText);
settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
optionInputs.forEach((input) => input.addEventListener("change", savePrefs));

function announce(message) {
  statusAnnouncer.textContent = message;
  setTimeout(() => (statusAnnouncer.textContent = ""), 1000);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => (errorMessage.style.display = "none"), 5000);
}

function updateCharCount() {
  charCount.textContent = inputText.value.length;
}

function readPrefs() {
  return {
    tone: document.querySelector('input[name="tone"]:checked').value,
    type: document.querySelector('input[name="type"]:checked').value,
    translate: translateCheckbox.checked,
  };
}

function writePrefs({ tone, type, translate }) {
  for (const [name, value] of [["tone", tone], ["type", type]]) {
    const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (radio) radio.checked = true;
  }
  translateCheckbox.checked = translate;
}

// The in-page icon, keyboard shortcut and context menu reuse the options picked here.
function savePrefs() {
  chrome.storage.sync.set({ prefs: readPrefs() });
}

function enhanceText() {
  const text = inputText.value.trim();
  if (!text) {
    showError("Please enter some text to enhance.");
    return;
  }

  setLoading(true);
  outputText.value = "";
  copyBtn.disabled = true;

  const port = chrome.runtime.connect({ name: "enhance" });
  port.onMessage.addListener((message) => {
    if (message.delta) {
      outputText.value += message.delta;
      outputText.scrollTop = outputText.scrollHeight;
      return;
    }

    if (message.error) {
      showError(message.error);
    } else {
      outputText.value = message.text;
      copyBtn.disabled = false;
      announce("Text enhancement complete");
      saveText();
    }
    setLoading(false);
    port.disconnect();
  });
  port.onDisconnect.addListener(() => setLoading(false));
  port.postMessage({ text, ...readPrefs() });
}

async function copyToClipboard() {
  if (!outputText.value) return;

  try {
    await navigator.clipboard.writeText(outputText.value);
    copyBtn.querySelector(".material-icons").textContent = "check";
    announce("Text copied to clipboard");
    setTimeout(() => (copyBtn.querySelector(".material-icons").textContent = "content_copy"), 2000);
  } catch {
    showError("Failed to copy text to clipboard.");
  }
}

function cleanAllText() {
  inputText.value = "";
  outputText.value = "";
  updateCharCount();
  copyBtn.disabled = true;
  translateCheckbox.checked = false;
  savePrefs();
  saveText();
}

function setLoading(isLoading) {
  enhanceBtn.disabled = isLoading;
  enhanceBtn.classList.toggle("loading", isLoading);
  enhanceBtn.setAttribute("aria-busy", String(isLoading));
  inputText.disabled = isLoading;
  cleanBtn.disabled = isLoading;
  optionInputs.forEach((input) => (input.disabled = isLoading));
  if (isLoading) announce("Processing your text, please wait");
}

function saveText() {
  if (!keepTextOnClose) return;
  chrome.storage.local.set({ persistedInputText: inputText.value, persistedOutputText: outputText.value });
}

async function loadText() {
  const { persistedInputText = "", persistedOutputText = "" } = await chrome.storage.local.get([
    "persistedInputText",
    "persistedOutputText",
  ]);
  inputText.value = persistedInputText;
  outputText.value = persistedOutputText;
  updateCharCount();
  copyBtn.disabled = !outputText.value;
}

async function refreshModelStatus() {
  const [model, apiKeys, { config }] = await Promise.all([getActiveModel(), getApiKeys(), loadConfig()]);
  const hasApiKey = Boolean(apiKeys[model.provider]);
  const providerName = config.providers[model.provider].name;

  modelName.textContent = `${model.name} (${providerName})`;
  enhanceBtn.disabled = !hasApiKey;
  enhanceBtn.title = hasApiKey ? "Enhance Message" : `Please set your ${providerName} API key in settings`;
  settingsBtn.style.animation = hasApiKey ? "" : "pulse 2s infinite";
  if (!hasApiKey) showError(`Please set your ${providerName} API key in the extension settings.`);
}

async function init() {
  initTheme();

  const [{ config }, prefs, settings, commands] = await Promise.all([
    loadConfig(),
    getPrefs(),
    chrome.storage.sync.get("keepTextOnClose"),
    chrome.commands.getAll(),
  ]);

  inputText.maxLength = config.limits.maxCharacters;
  charLimit.textContent = config.limits.maxCharacters;
  writePrefs(prefs);

  const shortcut = commands.find((c) => c.name === "enhance-field")?.shortcut;
  if (shortcut) shortcutHint.textContent = ` · ${shortcut} enhances any text field`;

  keepTextOnClose = settings.keepTextOnClose !== false;
  if (keepTextOnClose) await loadText();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.apiKeys || changes.model) refreshModelStatus();
    if (changes.keepTextOnClose) keepTextOnClose = changes.keepTextOnClose.newValue !== false;
  });

  await refreshModelStatus();
}

init();
