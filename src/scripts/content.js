// Message Enhancer Content Script - Simple Popup Pre-fill Version
// Detects text inputs and opens popup with text pre-filled

(function() {
  'use strict';

  console.log('Message Enhancer: Content script loaded on', window.location.href);
  console.log('Message Enhancer: Current hostname:', window.location.hostname);
  console.log('Message Enhancer: Current pathname:', window.location.pathname);

  // Early safety checks
  if (window.location.protocol.startsWith('chrome')) {
    console.log('Message Enhancer: Skipping chrome:// URL');
    return;
  }
  if (window.location.protocol.startsWith('moz-extension')) {
    console.log('Message Enhancer: Skipping moz-extension:// URL');
    return;
  }
  if (window.location.protocol === 'about:') {
    console.log('Message Enhancer: Skipping about: URL');
    return;
  }
  if (!document.body) {
    console.log('Message Enhancer: No document.body, waiting...');
    return;
  }

  let isEnabled = false;
  let blockedDomains = []; // Cache for parsed blocked domains
  const processedInputs = new WeakSet();
  const inputTimeouts = new Map(); // Track timeouts for each input
  const inputIconMap = new Map(); // Map inputs to their icons
  let currentFocusedInput = null; // Track currently focused input

  // Parse blocked domains from settings string
  function parseBlockedDomains(domainsString) {
    if (!domainsString || !domainsString.trim()) return [];
    
    return domainsString.split(",")
      .map(d => d.trim())
      .filter(d => d)
      .map(domain => {
        // Remove protocol if accidentally included
        if (domain.includes("://")) {
          domain = domain.split("://")[1];
        }
        return domain.toLowerCase();
      });
  }

  // Check if current URL matches any blocked domain
  function isCurrentUrlBlocked() {
    if (!blockedDomains.length) return false;
    
    const currentHost = window.location.hostname.toLowerCase();
    const currentPath = window.location.pathname;
    const currentUrl = currentHost + currentPath;
    
    return blockedDomains.some(blocked => {
      // If blocked domain contains path, match exact URL
      if (blocked.includes("/")) {
        return currentUrl.startsWith(blocked) || currentUrl === blocked;
      }
      // Otherwise match domain (including subdomains)
      return currentHost === blocked || currentHost.endsWith("." + blocked);
    });
  }

  // Check if we should run on this site
  function shouldRun() {
    const hostname = window.location.hostname.toLowerCase();
    const blockedPatterns = ['bank', 'paypal', 'secure', 'login', 'auth', 'admin'];
    const shouldRunBasic = !blockedPatterns.some(pattern => hostname.includes(pattern));
    
    // Check if URL is in user's blocked domains
    const isBlocked = isCurrentUrlBlocked();
    
    const shouldRun = shouldRunBasic && !isBlocked;
    console.log('Message Enhancer: Should run on', hostname, '?', shouldRun, '(blocked by user:', isBlocked, ')');
    return shouldRun;
  }

  // Check if element is a valid text input
  function isValidInput(element) {
    if (!element || processedInputs.has(element)) return false;
    
    const tag = element.tagName.toLowerCase();
    const type = (element.type || '').toLowerCase();
    
    // Valid input types
    if (tag === 'textarea') return true;
    if (tag === 'input' && ['text', 'email', ''].includes(type)) return true;
    if (element.contentEditable === 'true') return true;
    
    // Skip sensitive inputs
    if (element.disabled || element.readOnly) return false;
    const name = (element.name || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    if (name.includes('password') || id.includes('password')) return false;
    
    return true;
  }

  // Get text from input element
  function getInputText(element) {
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
      return element.value || '';
    }
    if (element.contentEditable === 'true') {
      return element.textContent || element.innerText || '';
    }
    return '';
  }

  // Create enhancement icon
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

    // Position icon relative to parent element
    const parent = input.parentElement;
    if (parent) {
      console.log('Message Enhancer: Adding icon to parent:', parent);
      if (window.getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(icon);
    } else {
      console.log('Message Enhancer: No parent element for input:', input);
      return null;
    }

    // Click handler - open popup with text
    icon.addEventListener('click', (e) => {
      console.log('Message Enhancer: Icon clicked!');
      e.preventDefault();
      e.stopPropagation();
      
      const text = getInputText(input).trim();
      console.log('Message Enhancer: Text to enhance:', text);
      
      if (!text) {
        console.log('Message Enhancer: No text found, aborting');
        return;
      }
      
      // Visual feedback - icon gets slightly smaller when clicked
      icon.style.transform = 'scale(0.9)';
      setTimeout(() => {
        icon.style.transform = 'scale(1)';
      }, 150);
      
      // Check if extension context is valid before sending message
      if (!chrome.runtime?.id) {
        console.log('Message Enhancer: Extension context invalidated, please reload the page');
        alert('Extension was reloaded. Please refresh this page to use Message Enhancer.');
        return;
      }
      
      // Send message to background script to open popup with text
      console.log('Message Enhancer: Sending message to background script');
      chrome.runtime.sendMessage({
        action: 'openPopupWithText',
        text: text.substring(0, 1000) // Limit to 1000 chars
      }).then(response => {
        console.log('Message Enhancer: Background script response:', response);
      }).catch(err => {
        if (err.message?.includes('Extension context invalidated')) {
          console.log('Message Enhancer: Extension was reloaded, please refresh the page');
          alert('Extension was reloaded. Please refresh this page to use Message Enhancer.');
        } else {
          console.error('Message Enhancer: Failed to send message:', err);
        }
      });
    });

    // Hover effect
    icon.addEventListener('mouseover', () => {
      icon.style.transform = 'scale(1.1)';
      icon.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
    });
    
    icon.addEventListener('mouseout', () => {
      icon.style.transform = 'scale(1)';
      icon.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    });

    return icon;
  }

  // Show/hide icon with 10-second delay after losing focus
  function updateIconVisibility(input, icon, eventType = 'check') {
    const text = getInputText(input).trim();
    const hasFocus = document.activeElement === input;
    const hasText = text.length > 0;
    
    console.log(`Message Enhancer: Icon visibility (${eventType}) for input:`, input, 'hasFocus:', hasFocus, 'textLength:', text.length);
    
    // Clear any existing timeout for this input
    if (inputTimeouts.has(input)) {
      clearTimeout(inputTimeouts.get(input));
      inputTimeouts.delete(input);
    }
    
    if (hasFocus && hasText) {
      // Input is focused with text - show icon immediately
      // Hide all other icons first
      hideAllOtherIcons(input);
      currentFocusedInput = input;
      icon.style.display = 'flex';
      console.log('Message Enhancer: Showing icon for focused input with text');
      
    } else if (!hasFocus && hasText && currentFocusedInput === input) {
      // Input lost focus but has text - keep visible for 10 seconds
      console.log('Message Enhancer: Input lost focus, keeping icon visible for 10 seconds');
      const timeoutId = setTimeout(() => {
        icon.style.display = 'none';
        inputTimeouts.delete(input);
        if (currentFocusedInput === input) {
          currentFocusedInput = null;
        }
        console.log('Message Enhancer: Icon hidden after 10-second delay');
      }, 10000);
      
      inputTimeouts.set(input, timeoutId);
      
    } else {
      // No text or not the focused input - hide immediately
      icon.style.display = 'none';
      if (currentFocusedInput === input) {
        currentFocusedInput = null;
      }
    }
  }
  
  // Hide all icons except for the specified input
  function hideAllOtherIcons(currentInput) {
    inputIconMap.forEach((icon, input) => {
      if (input !== currentInput) {
        // Clear timeout for this input
        if (inputTimeouts.has(input)) {
          clearTimeout(inputTimeouts.get(input));
          inputTimeouts.delete(input);
        }
        // Hide the icon
        icon.style.display = 'none';
        console.log('Message Enhancer: Hidden icon for other input:', input);
      }
    });
  }

  // Process a single input
  function processInput(input) {
    if (!isValidInput(input)) {
      console.log('Message Enhancer: Skipping invalid input:', input);
      return;
    }
    
    console.log('Message Enhancer: Processing input:', input);
    processedInputs.add(input);
    const icon = createIcon(input);
    if (!icon) {
      console.log('Message Enhancer: Failed to create icon for input:', input);
      return;
    }

    console.log('Message Enhancer: Created icon for input:', input);

    // Store the input-icon mapping
    inputIconMap.set(input, icon);

    // Add event listeners for input, focus, and blur
    input.addEventListener('input', () => updateIconVisibility(input, icon, 'input'));
    input.addEventListener('focus', () => updateIconVisibility(input, icon, 'focus'));
    input.addEventListener('blur', () => updateIconVisibility(input, icon, 'blur'));
    
    // Initial visibility check
    updateIconVisibility(input, icon);
  }

  // Find and process inputs
  function findInputs() {
    if (!isEnabled) return;
    if (!shouldRun()) {
      console.log('Message Enhancer: Skipping input processing - shouldRun() returned false');
      return;
    }
    
    const selectors = 'textarea, input[type="text"], input[type="email"], input:not([type]), [contenteditable="true"]';
    const inputs = document.querySelectorAll(selectors);
    
    console.log('Message Enhancer: Found', inputs.length, 'potential inputs');
    
    inputs.forEach((input, index) => {
      console.log(`Input ${index}:`, {
        tag: input.tagName,
        type: input.type,
        contentEditable: input.contentEditable,
        disabled: input.disabled,
        readOnly: input.readOnly,
        name: input.name,
        id: input.id,
        className: input.className
      });
      processInput(input);
    });
    
    // Special handling for common platforms
    handleSpecialPlatforms();
  }

  // Handle platform-specific input detection
  function handleSpecialPlatforms() {
    const hostname = window.location.hostname.toLowerCase();
    
    // Microsoft Teams - simplified selectors for better performance
    if (hostname.includes('teams.microsoft.com')) {
      console.log('Message Enhancer: Detected Teams, looking for Teams-specific inputs');
      
      // Simplified Teams selectors to reduce performance impact
      const teamsInputs = document.querySelectorAll('[role="textbox"][contenteditable="true"], .ck-content');
      console.log('Message Enhancer: Found', teamsInputs.length, 'Teams-specific inputs');
      
      teamsInputs.forEach(input => {
        if (!processedInputs.has(input)) {
          console.log('Processing Teams input:', input);
          processInput(input);
        }
      });
    }
    
    // Slack
    if (hostname.includes('slack.com')) {
      const slackInputs = document.querySelectorAll('.ql-editor, [data-qa="message_input"]');
      slackInputs.forEach(input => {
        if (!processedInputs.has(input)) {
          processInput(input);
        }
      });
    }
    
    // Gmail
    if (hostname.includes('gmail.com')) {
      const gmailInputs = document.querySelectorAll('[contenteditable="true"][role="textbox"], .Am.Al.editable');
      gmailInputs.forEach(input => {
        if (!processedInputs.has(input)) {
          processInput(input);
        }
      });
    }
  }

  // Initialize
  function init() {
    
    // Check if extension context is valid
    if (!chrome.runtime?.id) {
      console.log('Message Enhancer: Extension context not available during init');
      return;
    }
    
    // Check if enabled (default true if not set)
    try {
      chrome.storage.sync.get(['enableContentScript', 'blockedDomains'], (result) => {
        if (chrome.runtime.lastError) {
          console.log('Message Enhancer: Storage access failed:', chrome.runtime.lastError);
          return;
        }
        
        isEnabled = result.enableContentScript !== false; // Enabled by default
        blockedDomains = parseBlockedDomains(result.blockedDomains || '');
        console.log('Message Enhancer: Content script enabled:', isEnabled);
        console.log('Message Enhancer: Raw blocked domains string:', result.blockedDomains);
        console.log('Message Enhancer: Parsed blocked domains:', blockedDomains);
        console.log('Message Enhancer: Current URL blocked?', isCurrentUrlBlocked());
        
        // Check if we should run on this site AFTER loading settings
        if (!shouldRun()) {
          console.log('Message Enhancer: Not running on this site due to blocking rules');
          return;
        }
        
        if (isEnabled) {
          findInputs();
          
          // Re-scan periodically for dynamically loaded content
          const intervalId = setInterval(() => {
            if (!chrome.runtime?.id) {
              console.log('Message Enhancer: Extension context lost, clearing interval');
              clearInterval(intervalId);
              return;
            }
            if (isEnabled) {
              findInputs();
            }
          }, 2000); // Every 2 seconds to reduce performance impact
          
          // Add focus listener to document to catch dynamically created inputs
          document.addEventListener('focusin', (e) => {
            if (!isEnabled) return;
            
            const target = e.target;
            if (isValidInput(target) && !processedInputs.has(target)) {
              console.log('Message Enhancer: Detected new input on focus, processing:', target);
              processInput(target);
            }
          });
          
        }
      });

      // Listen for settings changes
      chrome.storage.onChanged.addListener((changes) => {
        if (!chrome.runtime?.id) {
          console.log('Message Enhancer: Extension context lost in storage listener');
          return;
        }
        
        if (changes.enableContentScript) {
          isEnabled = changes.enableContentScript.newValue !== false;
          if (isEnabled) {
            findInputs();
          } else {
            // Clear all timeouts and remove all icons
            inputTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
            inputTimeouts.clear();
            inputIconMap.clear();
            currentFocusedInput = null;
            
            const icons = document.querySelectorAll('.message-enhancer-icon, [title*="Message Enhancer"]');
            icons.forEach(icon => icon.remove());
          }
        }
        
        if (changes.blockedDomains) {
          blockedDomains = parseBlockedDomains(changes.blockedDomains.newValue || '');
          console.log('Message Enhancer: Updated blocked domains:', blockedDomains);
          
          // If current site is now blocked, remove all icons
          if (isCurrentUrlBlocked()) {
            inputTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
            inputTimeouts.clear();
            inputIconMap.clear();
            currentFocusedInput = null;
            
            const icons = document.querySelectorAll('.message-enhancer-icon, [title*="Message Enhancer"]');
            icons.forEach(icon => icon.remove());
            console.log('Message Enhancer: Site is now blocked, removed all icons');
          } else if (isEnabled) {
            // Site is no longer blocked, re-scan for inputs
            findInputs();
            console.log('Message Enhancer: Site is no longer blocked, re-scanning inputs');
          }
        }
      });
    } catch (error) {
      console.log('Message Enhancer: Error during initialization:', error);
    }
  }

  // Debug function accessible from console
  window.debugMessageEnhancer = function() {
    console.log('Message Enhancer Debug Info:');
    console.log('- Enabled:', isEnabled);
    console.log('- Blocked domains:', blockedDomains);
    console.log('- Current URL blocked?', isCurrentUrlBlocked());
    console.log('- Should run:', shouldRun());
    console.log('- Processed inputs:', processedInputs);
    console.log('- Current focused input:', currentFocusedInput);
    console.log('- Active timeouts:', inputTimeouts.size);
    
    // Check input-icon mapping
    console.log('- Input-Icon mappings:', inputIconMap.size);
    inputIconMap.forEach((icon, input, index) => {
      console.log(`  Input ${index}:`, {
        input: input,
        hasText: getInputText(input).trim().length > 0,
        hasFocus: document.activeElement === input,
        iconVisible: icon.style.display !== 'none',
        hasTimeout: inputTimeouts.has(input)
      });
    });
    
    // Check for existing icons
    const existingIcons = document.querySelectorAll('.message-enhancer-icon');
    console.log('- DOM icons found:', existingIcons.length);
    
    // Force scan for inputs
    console.log('Forcing input scan...');
    findInputs();
  };

  // Start when ready
  if (document.readyState === 'loading') {
    console.log('Message Enhancer: DOM still loading, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', init);
  } else {
    console.log('Message Enhancer: DOM ready, starting with delay');
    setTimeout(init, 500); // Small delay to be safe
  }

})();