const inputText = document.getElementById("input-text");
const outputText = document.getElementById("output-text");
const enhanceBtn = document.getElementById("enhance-btn");
const copyBtn = document.getElementById("copy-btn");
const replaceBtn = document.getElementById("replace-btn");
const cleanBtn = document.getElementById("clean-btn");
const settingsBtn = document.getElementById("settings-btn");
const charCount = document.getElementById("char-count");
const translateCheckbox = document.getElementById("translate");

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const debouncedSaveText = debounce(saveTextToStorage, 500);

inputText.addEventListener("input", updateCharCount);
inputText.addEventListener("input", debouncedSaveText);
inputText.addEventListener("keydown", handleEnterKey);
enhanceBtn.addEventListener("click", enhanceText);
copyBtn.addEventListener("click", copyToClipboard);
replaceBtn.addEventListener("click", replaceInputWithOutput);
cleanBtn.addEventListener("click", cleanAllText);
settingsBtn.addEventListener("click", openSettings);
translateCheckbox.addEventListener("change", saveTranslateState);

function handleEnterKey(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    enhanceText();
  }
}

function updateCharCount() {
  const count = inputText.value.length;
  charCount.textContent = count;

  if (count > 10000) {
    inputText.value = inputText.value.slice(0, 10000);
    charCount.textContent = "10000";
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
    chrome.storage.local.get(["fromWebsite"], (result) => {
      if (result.fromWebsite) {
        replaceBtn.classList.add("show");
      }
    });
    
    saveTextToStorage();
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

async function replaceInputWithOutput() {
  const enhancedText = outputText.value;

  if (!enhancedText) return;

  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tabs[0]) {
      showError("No active tab found");
      return;
    }

    const tabId = tabs[0].id;
    const connectionHealthy = await checkContentScriptConnection(tabId);

    if (!connectionHealthy) {
      await handleConnectionFailure(enhancedText);
      return;
    }

    const success = await replaceTextWithRetry(tabId, enhancedText, 3);

    if (success) {
      inputText.value = "";
      outputText.value = "";
      updateCharCount();
      copyBtn.disabled = true;
      replaceBtn.classList.remove("show");
      debouncedSaveText();
    } else {
      await handleConnectionFailure(enhancedText);
    }
  } catch (error) {
    showError("Error accessing tab: " + error.message);
  }
}

async function checkContentScriptConnection(tabId, timeoutMs = 2000) {
  try {
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, { action: "ping" }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      )
    ]);
    return response && response.pong === true;
  } catch (error) {
    return false;
  }
}

async function replaceTextWithRetry(tabId, text, maxRetries) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        action: "replaceText",
        text: text
      });
      
      if (response && response.success) {
        return true;
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    } catch (error) {
      if (attempt === maxRetries) {
        console.error("Final retry failed:", error.message);
      }
    }
  }
  return false;
}

async function handleConnectionFailure(text) {
  try {
    await navigator.clipboard.writeText(text);
    showError("Connection lost. Text copied to clipboard - please paste manually into the input field.");
    copyBtn.innerHTML = '<span class="material-icons">check</span>';
    setTimeout(() => {
      copyBtn.innerHTML = '<span class="material-icons">content_copy</span>';
    }, 3000);
  } catch (clipboardError) {
    showError("Connection failed and could not copy to clipboard. Please copy the enhanced text manually from the output field.");
  }
}

function saveTranslateState() {
  chrome.storage.sync.set({
    translateEnabled: translateCheckbox.checked
  });
}

function cleanAllText() {
  inputText.value = "";
  outputText.value = "";
  updateCharCount();
  copyBtn.disabled = true;
  replaceBtn.classList.remove("show");
  translateCheckbox.checked = false;
  saveTranslateState();
  debouncedSaveText();
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
  translateCheckbox.disabled = isLoading;
  cleanBtn.disabled = isLoading;
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

  chrome.storage.sync.get(["theme", "translateEnabled"], (result) => {
    const theme = result.theme || "system";
    document.documentElement.setAttribute("data-theme", theme);

    if (result.translateEnabled !== undefined) {
      translateCheckbox.checked = result.translateEnabled;
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.theme) {
      document.documentElement.setAttribute("data-theme", changes.theme.newValue);
    }
    if (changes.openaiApiKey) {
      checkApiKeyAndUpdateUI();
    }
    if (changes.keepTextOnClose && !changes.keepTextOnClose.newValue) {
      inputText.value = "";
      outputText.value = "";
      updateCharCount();
      copyBtn.disabled = true;
      replaceBtn.classList.remove("show");
    }
  });

  checkApiKeyAndUpdateUI();
  loadPersistedText();
  checkForPendingText();
});

// Clear website flag when popup closes
window.addEventListener("beforeunload", () => {
  chrome.storage.local.remove(["fromWebsite"]);
});

function saveTextToStorage() {
  chrome.storage.sync.get(["keepTextOnClose"], (result) => {
    if (result.keepTextOnClose !== false) {
      chrome.storage.sync.set({
        persistedInputText: inputText.value,
        persistedOutputText: outputText.value,
      });
    }
  });
}

function loadPersistedText() {
  chrome.storage.sync.get(["keepTextOnClose", "persistedInputText", "persistedOutputText"], (result) => {
    if (result.keepTextOnClose !== false) {
      inputText.value = result.persistedInputText || "";
      outputText.value = result.persistedOutputText || "";
      updateCharCount();
      copyBtn.disabled = !outputText.value;
    }
  });
}

function checkForPendingText() {
  chrome.storage.local.get(["pendingText", "pendingTimestamp", "autoEnhance"], (result) => {
    if (result.pendingText && result.pendingTimestamp) {
      const isRecent = (Date.now() - result.pendingTimestamp) < 10000;

      if (isRecent) {
        inputText.value = result.pendingText;
        outputText.value = "";
        updateCharCount();
        copyBtn.disabled = true;
        showAutoFillFeedback();
        chrome.storage.local.set({ fromWebsite: true });
        if (result.autoEnhance) {
          setTimeout(() => {
            enhanceText();
          }, 500);
        } else {
          replaceBtn.classList.remove("show");
        }
        chrome.storage.local.remove(["pendingText", "pendingTimestamp", "autoEnhance"]);
      } else {
        chrome.storage.local.remove(["pendingText", "pendingTimestamp", "autoEnhance"]);
      }
    }
  });
}

function showAutoFillFeedback() {
  const originalBorderColor = inputText.style.borderColor;
  inputText.style.borderColor = '#10b981';
  inputText.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
  inputText.focus();
  setTimeout(() => {
    inputText.style.borderColor = originalBorderColor;
    inputText.style.boxShadow = '';
  }, 2000);
}
