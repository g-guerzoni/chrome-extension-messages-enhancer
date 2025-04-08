const inputText = document.getElementById("input-text");
const outputText = document.getElementById("output-text");
const enhanceBtn = document.getElementById("enhance-btn");
const copyBtn = document.getElementById("copy-btn");
const settingsBtn = document.getElementById("settings-btn");
const charCount = document.getElementById("char-count");

inputText.addEventListener("input", updateCharCount);
enhanceBtn.addEventListener("click", enhanceText);
copyBtn.addEventListener("click", copyToClipboard);
settingsBtn.addEventListener("click", openSettings);

document.querySelectorAll('input[name="type"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    const messageType = e.target.value;
    const currentTone = document.querySelector('input[name="tone"]:checked').value;

    if (messageType === "email" && currentTone !== "formal") {
      document.querySelector('input[name="tone"][value="neutral"]').checked = true;
    } else if (messageType === "message" && currentTone !== "formal") {
      document.querySelector('input[name="tone"][value="informal"]').checked = true;
    }
  });
});

function updateCharCount() {
  const count = inputText.value.length;
  charCount.textContent = count;

  if (count > 1000) {
    inputText.value = inputText.value.slice(0, 1000);
    charCount.textContent = "1000";
  }
}

async function enhanceText() {
  const text = inputText.value.trim();

  if (!text) {
    showError("Please enter some text to enhance.");
    return;
  }

  const tone = document.querySelector('input[name="tone"]:checked').value;
  const type = document.querySelector('input[name="type"]:checked').value;
  const translate = document.querySelector("#translate").checked;

  setLoading(true);

  try {
    const response = await chrome.runtime.sendMessage({
      action: "enhanceText",
      data: { text, tone, type, translate },
    });

    if (response.error) {
      throw new Error(response.error);
    }

    outputText.value = response.enhancedText;
    copyBtn.disabled = false;
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

async function copyToClipboard() {
  const text = outputText.value;

  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);

    copyBtn.innerHTML = '<span class="material-icons">check</span>';
    setTimeout(() => {
      copyBtn.innerHTML = '<span class="material-icons">content_copy</span>';
    }, 2000);
  } catch (error) {
    showError("Failed to copy text to clipboard");
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function showError(message) {
  let errorDiv = document.querySelector(".error-message");
  if (!errorDiv) {
    errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    const optionsSection = document.querySelector(".options-section");
    optionsSection.parentNode.insertBefore(errorDiv, optionsSection.nextSibling);
  }

  errorDiv.textContent = message;
  errorDiv.style.display = "block";

  setTimeout(() => {
    errorDiv.style.display = "none";
  }, 3000);
}

function setLoading(isLoading) {
  enhanceBtn.disabled = isLoading;
  enhanceBtn.className = isLoading ? "primary-button loading" : "primary-button";
  inputText.disabled = isLoading;
  document.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.disabled = isLoading;
  });
}

function checkApiKeyAndUpdateUI() {
  chrome.storage.sync.get(["openaiApiKey"], (result) => {
    const hasApiKey = result.openaiApiKey && result.openaiApiKey.trim().length > 0;

    enhanceBtn.disabled = !hasApiKey;
    enhanceBtn.title = hasApiKey ? "Enhance Message" : "Please set your API key in settings";

    if (!hasApiKey) {
      showError("Please set your OpenAI API key in the extension settings.");
      settingsBtn.style.animation = "pulse 2s infinite";
    } else {
      settingsBtn.style.animation = "";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  copyBtn.disabled = true;

  chrome.storage.sync.get(["theme"], (result) => {
    const theme = result.theme || "system";
    document.documentElement.setAttribute("data-theme", theme);
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.theme) {
      document.documentElement.setAttribute("data-theme", changes.theme.newValue);
    }
    if (changes.openaiApiKey) {
      checkApiKeyAndUpdateUI();
    }
  });

  checkApiKeyAndUpdateUI();
});
