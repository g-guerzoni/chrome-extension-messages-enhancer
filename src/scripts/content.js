(function() {
  "use strict";
  if (window.location.protocol.startsWith('chrome')) {
    return;
  }
  if (window.location.protocol.startsWith('moz-extension')) {
    return;
  }
  if (window.location.protocol === 'about:') {
    return;
  }
  if (!document.body) {
    return;
  }

  let isEnabled = false;
  let blockedDomains = [];
  const processedInputs = new WeakSet();
  const inputTimeouts = new Map();
  const inputIconMap = new Map();
  let currentFocusedInput = null;

  function parseBlockedDomains(domainsString) {
    if (!domainsString || !domainsString.trim()) return [];
    
    return domainsString.split(",")
      .map(d => d.trim())
      .filter(d => d)
      .map(domain => {
        if (domain.includes("://")) {
          domain = domain.split("://")[1];
        }
        return domain.toLowerCase();
      });
  }

  function isCurrentUrlBlocked() {
    if (!blockedDomains.length) return false;
    
    const currentHost = window.location.hostname.toLowerCase();
    const currentPath = window.location.pathname;
    const currentUrl = currentHost + currentPath;
    
    return blockedDomains.some(blocked => {
      if (blocked.includes("/")) {
        return currentUrl.startsWith(blocked) || currentUrl === blocked;
      }
      return currentHost === blocked || currentHost.endsWith("." + blocked);
    });
  }

  // Check if we should run on this site
  function shouldRun() {
    const hostname = window.location.hostname.toLowerCase();
    const blockedPatterns = ['bank', 'paypal', 'secure', 'login', 'auth', 'admin'];
    const shouldRunBasic = !blockedPatterns.some(pattern => hostname.includes(pattern));
    const isBlocked = isCurrentUrlBlocked();
    
    const shouldRun = shouldRunBasic && !isBlocked;
    return shouldRun;
  }

  function isValidInput(element) {
    if (!element || processedInputs.has(element)) return false;
    
    const tag = element.tagName.toLowerCase();
    const type = (element.type || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input' && ['text', 'email', ''].includes(type)) return true;
    if (element.contentEditable === 'true') return true;

    if (element.disabled || element.readOnly) return false;
    const name = (element.name || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    if (name.includes('password') || id.includes('password')) return false;
    
    return true;
  }

  function getInputText(element) {
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
      return element.value || '';
    }
    if (element.contentEditable === 'true') {
      return element.textContent || element.innerText || '';
    }
    return '';
  }

  function setInputText(element, text) {
    if (!element) return;
    
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.contentEditable === 'true') {
      element.textContent = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    element.focus();
  }

  function createIcon(input) {
    const icon = document.createElement('div');
    icon.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      background: #4f46e5;
      color: white;
      border-radius: 50%;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 999999;
      font-size: 12px;
      font-family: Arial, sans-serif;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transition: all 0.2s ease;
      pointer-events: auto !important;
    `;
    icon.innerHTML = '✨';
    icon.title = 'Enhance this text with Message Enhancer';
    icon.className = 'message-enhancer-icon';

    const parent = input.parentElement;
    if (parent) {
      if (window.getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(icon);
    } else {
      return null;
    }

    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const text = getInputText(input).trim();
      
      if (!text) {
        return;
      }
      currentFocusedInput = input;
      icon.style.transform = 'scale(0.9)';
      setTimeout(() => {
        icon.style.transform = 'scale(1)';
      }, 150);
      if (!chrome.runtime?.id) {
        alert('Extension was reloaded. Please refresh this page to use Message Enhancer.');
        return;
      }
      chrome.runtime.sendMessage({
        action: 'openPopupWithText',
        text: text.substring(0, 10000)
      }).then(() => {
      }).catch(err => {
        if (err.message?.includes('Extension context invalidated')) {
          alert('Extension was reloaded. Please refresh this page to use Message Enhancer.');
        }
      });
    });

    icon.addEventListener('mouseover', () => {
      icon.style.transform = "scale(1.1)";
      icon.style.boxShadow = "0 4px 8px rgba(0,0,0,0.3)";
    });

    icon.addEventListener("mouseout", () => {
      icon.style.transform = "scale(1)";
      icon.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
    });

    return icon;
  }

  function updateIconVisibility(input, icon) {
    const text = getInputText(input).trim();
    const hasFocus = document.activeElement === input;
    const hasText = text.length > 0;
    if (inputTimeouts.has(input)) {
      clearTimeout(inputTimeouts.get(input));
      inputTimeouts.delete(input);
    }

    if (hasFocus && hasText) {
      hideAllOtherIcons(input);
      currentFocusedInput = input;
      icon.style.display = "flex";
    } else if (!hasFocus && hasText && currentFocusedInput === input) {
      const timeoutId = setTimeout(() => {
        icon.style.display = "none";
        inputTimeouts.delete(input);
        if (currentFocusedInput === input) {
          currentFocusedInput = null;
        }
      }, 10000);

      inputTimeouts.set(input, timeoutId);
    } else {
      icon.style.display = "none";
      if (currentFocusedInput === input) {
        currentFocusedInput = null;
      }
    }
  }
  function hideAllOtherIcons(currentInput) {
    inputIconMap.forEach((icon, input) => {
      if (input !== currentInput) {
        if (inputTimeouts.has(input)) {
          clearTimeout(inputTimeouts.get(input));
          inputTimeouts.delete(input);
        }
        icon.style.display = "none";
      }
    });
  }

  function processInput(input) {
    if (!isValidInput(input)) {
      return;
    }
    
    processedInputs.add(input);
    const icon = createIcon(input);
    if (!icon) {
      return;
    }
    inputIconMap.set(input, icon);

    input.addEventListener("input", () => updateIconVisibility(input, icon));
    input.addEventListener("focus", () => updateIconVisibility(input, icon));
    input.addEventListener("blur", () => updateIconVisibility(input, icon));
    updateIconVisibility(input, icon);
  }

  function findInputs() {
    if (!isEnabled) return;
    if (!shouldRun()) {
      return;
    }

    const selectors = "textarea, input[type=\"text\"], input[type=\"email\"], input:not([type]), [contenteditable=\"true\"]";
    const inputs = document.querySelectorAll(selectors);


    inputs.forEach((input) => {
      processInput(input);
    });
    
    // Special handling for common platforms
    handleSpecialPlatforms();
  }

  function handleSpecialPlatforms() {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes("teams.microsoft.com")) {
      const teamsInputs = document.querySelectorAll("[role=\"textbox\"][contenteditable=\"true\"], .ck-content");

      teamsInputs.forEach(input => {
        if (!processedInputs.has(input)) {
          processInput(input);
        }
      });
    }
    if (hostname.includes("slack.com")) {
      const slackInputs = document.querySelectorAll(".ql-editor, [data-qa=\"message_input\"]");
      slackInputs.forEach(input => {
        if (!processedInputs.has(input)) {
          processInput(input);
        }
      });
    }
    if (hostname.includes("gmail.com")) {
      const gmailInputs = document.querySelectorAll("[contenteditable=\"true\"][role=\"textbox\"], .Am.Al.editable");
      gmailInputs.forEach(input => {
        if (!processedInputs.has(input)) {
          processInput(input);
        }
      });
    }
  }

  let teamsNavigationHandler = null;

  function setupTeamsNavigationHandling() {
    const hostname = window.location.hostname.toLowerCase();
    if (!hostname.includes("teams.microsoft.com")) return;

    if (teamsNavigationHandler) return;
    
    teamsNavigationHandler = () => {
      setTimeout(() => {
        if (isEnabled && shouldRun()) {
          findInputs();
        }
      }, 1000);
    };
    window.addEventListener("hashchange", teamsNavigationHandler);
    window.addEventListener("popstate", teamsNavigationHandler);
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      teamsNavigationHandler();
    };
    
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      teamsNavigationHandler();
    };
  }

  function init() {
    if (!chrome.runtime?.id) {
      return;
    }
    try {
      chrome.storage.sync.get(["enableContentScript", "blockedDomains"], (result) => {
        if (chrome.runtime.lastError) {
          return;
        }

        isEnabled = result.enableContentScript !== false;
        blockedDomains = parseBlockedDomains(result.blockedDomains || "");
        if (!shouldRun()) {
          return;
        }
        
        if (isEnabled) {
          findInputs();
          setupTeamsNavigationHandling();
          const intervalId = setInterval(() => {
            if (!chrome.runtime?.id) {
              clearInterval(intervalId);
              return;
            }
            if (isEnabled) {
              findInputs();
            }
          }, 2000); // Every 2 seconds to reduce performance impact
          document.addEventListener('focusin', (e) => {
            if (!isEnabled) return;
            
            const target = e.target;
            if (isValidInput(target) && !processedInputs.has(target)) {
              processInput(target);
            }
          });
          
        }
      });

      chrome.storage.onChanged.addListener((changes) => {
        if (!chrome.runtime?.id) {
          return;
        }
        
        if (changes.enableContentScript) {
          isEnabled = changes.enableContentScript.newValue !== false;
          if (isEnabled) {
            findInputs();
            setupTeamsNavigationHandling();
          } else {
            inputTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
            inputTimeouts.clear();
            inputIconMap.clear();
            currentFocusedInput = null;
            
            const icons = document.querySelectorAll('.message-enhancer-icon, [title*="Message Enhancer"]');
            icons.forEach(icon => icon.remove());
          }
        }

        if (changes.blockedDomains) {
          blockedDomains = parseBlockedDomains(changes.blockedDomains.newValue || "");
          if (isCurrentUrlBlocked()) {
            inputTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
            inputTimeouts.clear();
            inputIconMap.clear();
            currentFocusedInput = null;
            
            const icons = document.querySelectorAll('.message-enhancer-icon, [title*="Message Enhancer"]');
            icons.forEach(icon => icon.remove());
          } else if (isEnabled) {
            findInputs();
            setupTeamsNavigationHandling();
          }
        }
      });
    } catch (error) {
    }
  }

  let messageListenerRegistered = false;
  
  function registerMessageListener() {
    if (messageListenerRegistered) return;
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "ping") {
        sendResponse({ pong: true });
        return true;
      }
      
      if (request.action === "replaceText") {
        if (!currentFocusedInput) {
          sendResponse({ success: false, error: "No input element tracked" });
          return true;
        }
        
        try {
          setInputText(currentFocusedInput, request.text);
          currentFocusedInput = null;
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return true;
      }

      return true;
    });
    
    messageListenerRegistered = true;
  }
  registerMessageListener();

  window.debugMessageEnhancer = function() {
    console.log("Message Enhancer Debug Info:");
    console.log("- Enabled:", isEnabled);
    console.log("- Blocked domains:", blockedDomains);
    console.log("- Current URL blocked?", isCurrentUrlBlocked());
    console.log("- Should run:", shouldRun());
    console.log("- Processed inputs:", processedInputs);
    console.log("- Current focused input:", currentFocusedInput);
    console.log("- Active timeouts:", inputTimeouts.size);
    console.log("- Input-Icon mappings:", inputIconMap.size);
    inputIconMap.forEach((icon, input) => {
      console.log("  Input:", {
        input: input,
        hasText: getInputText(input).trim().length > 0,
        hasFocus: document.activeElement === input,
        iconVisible: icon.style.display !== "none",
        hasTimeout: inputTimeouts.has(input)
      });
    });
    const existingIcons = document.querySelectorAll(".message-enhancer-icon");
    console.log("- DOM icons found:", existingIcons.length);
    console.log("Forcing input scan...");
    findInputs();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 500);
  }

})();