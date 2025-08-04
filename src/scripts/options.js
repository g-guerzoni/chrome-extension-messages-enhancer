const apiKeyInput = document.getElementById("api-key");
const themeSelect = document.getElementById("theme");
const keepTextCheckbox = document.getElementById("keep-text");
const saveButton = document.getElementById("save-btn");
const statusDiv = document.getElementById("status");
const togglePasswordBtn = document.querySelector(".toggle-password");

chrome.storage.sync.get(["openaiApiKey", "theme", "keepTextOnClose"], (result) => {
  if (result.openaiApiKey) {
    apiKeyInput.value = result.openaiApiKey;
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
});

saveButton.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  const theme = themeSelect.value;
  const keepTextOnClose = keepTextCheckbox.checked;

  if (!apiKey) {
    showStatus("Please enter an API key", "error");
    return;
  }

  if (!apiKey.startsWith("sk-") || apiKey.length < 20) {
    showStatus('Invalid API key format. It should start with "sk-" and be at least 20 characters long.', "error");
    return;
  }

  const settingsToSave = {
    openaiApiKey: apiKey,
    theme: theme,
    keepTextOnClose: keepTextOnClose,
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
