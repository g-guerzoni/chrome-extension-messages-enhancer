import { loadConfig, getActiveModel, getApiKeys, getPrefs, initTheme, setIcon } from "./shared.js";

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
const setupNotice = document.getElementById("setup-notice");
const setupProvider = document.getElementById("setup-provider");
const setupKeyLink = document.getElementById("setup-key-link");
const buttonText = enhanceBtn.querySelector(".button-text");

let keepTextOnClose = true;

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
  hideError();
  debouncedSaveText();
});
inputText.addEventListener("keydown", (event) => {
  // Enter also confirms IME candidates (e.g. Japanese, Chinese); don't treat that as "enhance".
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (!enhanceBtn.disabled) enhanceText();
  }
});
enhanceBtn.addEventListener("click", enhanceText);
copyBtn.addEventListener("click", copyToClipboard);
cleanBtn.addEventListener("click", cleanAllText);
settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("setup-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
optionInputs.forEach((input) => input.addEventListener("change", savePrefs));

function announce(message) {
  statusAnnouncer.textContent = message;
  setTimeout(() => (statusAnnouncer.textContent = ""), 1000);
}

// Errors stay until the user edits the text or runs again, so they can be read.
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}

function hideError() {
  errorMessage.style.display = "none";
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
  if (enhanceBtn.classList.contains("loading")) return;
  hideError();

  const text = inputText.value.trim();
  if (!text) {
    showError("Please enter some text to enhance.");
    return;
  }

  setLoading(true);
  copyBtn.disabled = true;
  let receivedDelta = false;

  const port = chrome.runtime.connect({ name: "enhance" });
  port.onMessage.addListener((message) => {
    if (message.delta) {
      // Clear only once text arrives, so a failed retry keeps the previous result.
      if (!receivedDelta) outputText.value = "";
      receivedDelta = true;
      outputText.value += message.delta;
      outputText.scrollTop = outputText.scrollHeight;
      return;
    }

    if (message.error) {
      showError(message.error);
      copyBtn.disabled = !outputText.value;
    } else {
      outputText.value = message.text;
      outputText.scrollTop = 0;
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
    setIcon(copyBtn, "check");
    announce("Text copied to clipboard");
    setTimeout(() => setIcon(copyBtn, "content_copy"), 2000);
  } catch {
    showError("Failed to copy text to clipboard.");
  }
}

function cleanAllText() {
  inputText.value = "";
  outputText.value = "";
  updateCharCount();
  copyBtn.disabled = true;
  hideError();
  saveText();
  inputText.focus();
}

function setLoading(isLoading) {
  enhanceBtn.disabled = isLoading;
  enhanceBtn.classList.toggle("loading", isLoading);
  enhanceBtn.setAttribute("aria-busy", String(isLoading));
  buttonText.textContent = isLoading ? "Enhancing…" : "Enhance";
  // readOnly instead of disabled keeps focus in the textarea for the next Enter.
  inputText.readOnly = isLoading;
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
  const provider = config.providers[model.provider];

  modelName.textContent = `${model.name} (${provider.name})`;
  enhanceBtn.disabled = !hasApiKey;
  setupNotice.hidden = hasApiKey;
  setupProvider.textContent = provider.name;
  setupKeyLink.href = provider.keyUrl;
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
