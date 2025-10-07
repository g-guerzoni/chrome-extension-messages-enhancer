const apiKeyInput = document.getElementById("api-key");
const modelSelect = document.getElementById("model");
const themeSelect = document.getElementById("theme");
const keepTextCheckbox = document.getElementById("keep-text");
const contentScriptCheckbox = document.getElementById("content-script");
const debugModeCheckbox = document.getElementById("debug-mode");
const blockedDomainsTextarea = document.getElementById("blocked-domains");
const saveButton = document.getElementById("save-btn");
const statusDiv = document.getElementById("status");
const togglePasswordBtn = document.querySelector(".toggle-password");

chrome.storage.sync.get(["openaiApiKey", "openaiModel", "theme", "keepTextOnClose", "enableContentScript", "debugMode", "blockedDomains"], (result) => {
  if (result.openaiApiKey) {
    apiKeyInput.value = result.openaiApiKey;
  }
  if (result.openaiModel) {
    modelSelect.value = result.openaiModel;
  } else {
    modelSelect.value = "gpt-5-nano-2025-08-07";
  }
  if (result.theme) {
    themeSelect.value = result.theme;
    document.documentElement.setAttribute("data-theme", result.theme);
  } else {
    themeSelect.value = "system";
    document.documentElement.setAttribute("data-theme", "system");
  }
  if (result.keepTextOnClose !== undefined) {
    keepTextCheckbox.checked = result.keepTextOnClose;
  } else {
    keepTextCheckbox.checked = true;
  }
  if (result.enableContentScript !== undefined) {
    contentScriptCheckbox.checked = result.enableContentScript;
  } else {
    contentScriptCheckbox.checked = true;
  }
  if (result.debugMode !== undefined) {
    debugModeCheckbox.checked = result.debugMode;
  } else {
    debugModeCheckbox.checked = false;
  }
  if (result.blockedDomains) {
    blockedDomainsTextarea.value = result.blockedDomains;
  }
});

function validateDomains(domainsString) {
  if (!domainsString.trim()) return { valid: true, domains: [] };
  
  const domains = domainsString.split(",").map(d => d.trim()).filter(d => d);
  const validDomains = [];
  const errors = [];
  
  domains.forEach(domain => {
    if (domain.includes("://")) {
      errors.push(`"${domain}" - Remove protocol (http:// or https://)`);
      return;
    }
    
    if (domain.match(/^[a-zA-Z0-9]([a-zA-Z0-9\-\.\/]*[a-zA-Z0-9\/])?$/)) {
      validDomains.push(domain);
    } else {
      errors.push(`"${domain}" - Invalid domain format`);
    }
  });
  
  return { valid: errors.length === 0, domains: validDomains, errors };
}

saveButton.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const theme = themeSelect.value;
  const keepTextOnClose = keepTextCheckbox.checked;
  const enableContentScript = contentScriptCheckbox.checked;
  const debugMode = debugModeCheckbox.checked;
  const blockedDomainsString = blockedDomainsTextarea.value.trim();

  if (!apiKey) {
    showStatus("Please enter an API key", "error");
    return;
  }

  if (!apiKey.startsWith("sk-") || apiKey.length < 20) {
    showStatus('Invalid API key format. It should start with "sk-" and be at least 20 characters long.', "error");
    return;
  }

  const domainValidation = validateDomains(blockedDomainsString);
  if (!domainValidation.valid) {
    showStatus("Invalid domain format: " + domainValidation.errors.join(", "), "error");
    return;
  }

  const settingsToSave = {
    openaiApiKey: apiKey,
    openaiModel: model,
    theme: theme,
    keepTextOnClose: keepTextOnClose,
    enableContentScript: enableContentScript,
    debugMode: debugMode,
    blockedDomains: blockedDomainsString,
  };

  if (!keepTextOnClose) {
    settingsToSave.persistedInputText = "";
    settingsToSave.persistedOutputText = "";
  }

  chrome.storage.sync.set(settingsToSave, () => {
    if (chrome.runtime.lastError) {
      showStatus("Error saving settings: " + chrome.runtime.lastError.message, "error");
    } else {
      showStatus("Settings saved successfully!", "success");
      document.documentElement.setAttribute("data-theme", theme);
    }
  });
});

themeSelect.addEventListener("change", (e) => {
  document.documentElement.setAttribute("data-theme", e.target.value);
});

togglePasswordBtn.addEventListener("click", () => {
  const type = apiKeyInput.type === "password" ? "text" : "password";
  const icon = type === "password" ? "visibility_off" : "visibility";

  apiKeyInput.type = type;
  togglePasswordBtn.querySelector(".material-icons").textContent = icon;
});

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;

  setTimeout(() => {
    statusDiv.className = "status";
  }, 3000);
}
