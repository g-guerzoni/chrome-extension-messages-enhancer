// Shared helpers for the extension pages (popup, options) and the service worker.
// Content scripts cannot import modules, so they talk to the service worker instead.

let configPromise = null;

function fetchJson(name) {
  return fetch(chrome.runtime.getURL(`src/config/${name}.json`)).then((r) => r.json());
}

export function loadConfig() {
  configPromise ??= Promise.all([fetchJson("config"), fetchJson("model"), fetchJson("instructions")]).then(
    ([config, models, instructions]) => ({ config, models, instructions })
  );
  return configPromise;
}

export async function getActiveModel() {
  const [{ models }, { model }] = await Promise.all([loadConfig(), chrome.storage.sync.get("model")]);
  return models.models.find((m) => m.id === model) ?? models.models.find((m) => m.id === models.defaultModel);
}

export async function getApiKeys() {
  const { apiKeys } = await chrome.storage.local.get("apiKeys");
  return apiKeys ?? {};
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
