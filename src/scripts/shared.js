// Shared helpers for the extension pages (popup, options) and the service worker.
// Content scripts cannot import modules, so they talk to the service worker instead.

let configPromise = null;

function fetchJson(name) {
  return fetch(chrome.runtime.getURL(`src/config/${name}.json`)).then((r) => r.json());
}

export function loadConfig() {
  configPromise ??= Promise.all([fetchJson("config"), fetchJson("model"), fetchJson("instructions")])
    .then(([config, models, instructions]) => ({ config, models, instructions }))
    .catch((error) => {
      // Don't cache a failed load for the rest of the worker's life.
      configPromise = null;
      throw error;
    });
  return configPromise;
}

// A listed model, or any OpenRouter model ID the user typed ("vendor/model"); null otherwise.
export function resolveModel(models, id) {
  const listed = models.models.find((m) => m.id === id);
  if (listed) return listed;
  const { provider, pattern } = models.customModel;
  return id && new RegExp(pattern, "i").test(id) ? { id, name: id, provider, params: {}, custom: true } : null;
}

// The model lives in local storage next to the API keys, so a synced choice can never point
// at a provider whose key only exists on another device.
export async function getActiveModel() {
  const [{ models }, { model }] = await Promise.all([loadConfig(), chrome.storage.local.get("model")]);
  return resolveModel(models, model) ?? resolveModel(models, models.defaultModel);
}

export async function getApiKeys() {
  const { apiKeys } = await chrome.storage.local.get("apiKeys");
  return apiKeys ?? {};
}

export const DATA_CONSENT_VERSION = 1;

export async function hasDataConsent() {
  const { dataConsent } = await chrome.storage.local.get("dataConsent");
  return dataConsent?.version === DATA_CONSENT_VERSION;
}

export async function getPrefs() {
  const [{ config }, { prefs }] = await Promise.all([loadConfig(), chrome.storage.sync.get("prefs")]);
  return { ...config.defaults.prefs, ...prefs };
}

export function formatPrice({ input, output }) {
  return `$${input} in / $${output} out per 1M tokens`;
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme || "system");
}

export async function initTheme() {
  const { theme } = await chrome.storage.sync.get("theme");
  applyTheme(theme);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.theme) applyTheme(changes.theme.newValue);
  });
}

// Swaps the sprite icon (src/interface/icons.svg) shown inside a button.
export function setIcon(button, name) {
  button.querySelector("svg.icon use").setAttribute("href", `icons.svg#${name}`);
}
