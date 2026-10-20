(() => {
  "use strict";

  const ICON_SIZE = 24;
  const ICON_OFFSET = 6;
  const TOAST_DURATION_MS = 6000;
  const TEXT_INPUT_TYPES = ["text", "search"];
  const SENSITIVE_FIELD = /password|one-time-code|cc-(number|csc)/i;

  let iconsEnabled = false;
  let blockedDomains = [];
  let contentConfig = null;
  let activeField = null;
  let busy = false;
  let ui = null;
  let toastTimer = null;

  // ---------------------------------------------------------------------------
  // Text fields
  // ---------------------------------------------------------------------------

  function isFormControl(el) {
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
  }

  // Maps any focused node to the field we can edit, or null if it is not one.
  function resolveField(el) {
    if (!(el instanceof HTMLElement)) return null;

    if (isFormControl(el)) {
      const isText = el instanceof HTMLTextAreaElement || TEXT_INPUT_TYPES.includes(el.type);
      const isSensitive = SENSITIVE_FIELD.test(`${el.name} ${el.id} ${el.autocomplete}`);
      return isText && !el.disabled && !el.readOnly && !isSensitive ? el : null;
    }

    if (!el.isContentEditable) return null;
    // Walk up to the editing host so nested editable nodes resolve to the same field.
    let field = el;
    while (field.parentElement?.isContentEditable) field = field.parentElement;
    return field;
  }

  function deepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function getText(field) {
    return isFormControl(field) ? field.value : field.innerText;
  }

  function hasText(field) {
    // textContent avoids the layout cost of innerText on every keystroke.
    return (isFormControl(field) ? field.value : field.textContent).trim().length > 0;
  }

  function captureSelection(field) {
    if (isFormControl(field)) {
      const { selectionStart: start, selectionEnd: end } = field;
      return start !== end ? { start, end, text: field.value.slice(start, end) } : null;
    }

    const selection = getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    return field.contains(range.commonAncestorContainer) ? { range: range.cloneRange(), text: selection.toString() } : null;
  }

  function selectTarget(field, selection) {
    field.focus();
    if (isFormControl(field)) {
      selection ? field.setSelectionRange(selection.start, selection.end) : field.select();
      return;
    }

    let range = selection?.range;
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(field);
    }
    const current = getSelection();
    current.removeAllRanges();
    current.addRange(range);
  }

  // execCommand goes through the browser's editing pipeline, so rich editors (Slack, Teams,
  // Gmail) update their internal state and the change lands on the native undo stack.
  function insertText(field, text, selection) {
    selectTarget(field, selection);
    if (document.execCommand("insertText", false, text)) return;

    if (isFormControl(field)) {
      // Use the prototype setter so frameworks like React notice the change.
      const { set } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value");
      const value = selection ? field.value.slice(0, selection.start) + text + field.value.slice(selection.end) : text;
      set.call(field, value);
    } else if (selection) {
      selection.range.deleteContents();
      selection.range.insertNode(document.createTextNode(text));
    } else {
      field.innerText = text;
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function undo(field, before) {
    hideToast();
    field.focus();
    document.execCommand("undo");
    if (getText(field).trim() !== before.trim()) insertText(field, before, null);
  }

  // ---------------------------------------------------------------------------
  // Enhancement
  // ---------------------------------------------------------------------------

  async function enhanceField(field) {
    if (busy) return;

    const selection = captureSelection(field);
    const before = getText(field);
    const [, leading, text, trailing] = (selection?.text ?? before).match(/^(\s*)([\s\S]*?)(\s*)$/);

    if (!text) {
      showToast("Type some text first.");
      return;
    }

    setBusy(true);
    showToast("Enhancing text…");
    try {
      const response = await chrome.runtime.sendMessage({ action: "enhanceText", data: { text } });
      if (response?.error) throw new Error(response.error);
      if (!field.isConnected) throw new Error("The text field is no longer on the page.");

      insertText(field, leading + response.text + trailing, selection);
      showToast("Text enhanced.", { label: "Undo", onClick: () => undo(field, before) });
    } catch (error) {
      const invalidated = !chrome.runtime?.id || error.message?.includes("Extension context invalidated");
      showToast(invalidated ? "The extension was updated. Refresh this page to keep using it." : error.message, {
        isError: true,
      });
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // UI (isolated in a closed shadow root so page styles cannot leak in)
  // ---------------------------------------------------------------------------

  const STYLES = `
    .icon {
      position: fixed;
      width: ${ICON_SIZE}px;
      height: ${ICON_SIZE}px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: #4f46e5;
      color: #fff;
      font: 12px/1 Arial, sans-serif;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .icon:hover { transform: scale(1.1); box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3); }
    .icon:focus-visible { outline: 3px solid #a5b4fc; outline-offset: 2px; }
    .icon[aria-busy="true"] { cursor: progress; font-size: 0; }
    .icon[aria-busy="true"]::after {
      content: "";
      display: block;
      width: 12px;
      height: 12px;
      margin: auto;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
      align-items: center;
      max-width: min(480px, calc(100vw - 32px));
      padding: 10px 14px;
      border-radius: 8px;
      background: #1f2937;
      color: #f3f4f6;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .toast.error { background: #991b1b; }
    .toast button {
      padding: 2px 6px;
      border: none;
      background: none;
      color: #a5b4fc;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    [hidden] { display: none !important; }
  `;

  function ensureUi() {
    if (ui) return ui;

    const host = document.createElement("message-enhancer-ui");
    host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = STYLES;

    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "icon";
    icon.textContent = "✨";
    icon.title = "Enhance text";
    icon.setAttribute("aria-label", "Enhance text with AI Message Enhancer");
    icon.hidden = true;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.hidden = true;
    const toastMessage = document.createElement("span");
    const toastAction = document.createElement("button");
    toastAction.type = "button";
    toast.append(toastMessage, toastAction);

    // Keep focus (and the selection) inside the page's field when clicking our buttons.
    for (const button of [icon, toastAction]) button.addEventListener("mousedown", (e) => e.preventDefault());
    icon.addEventListener("click", () => activeField && enhanceField(activeField));

    root.append(style, icon, toast);
    document.documentElement.append(host);
    ui = { icon, toast, toastMessage, toastAction };
    return ui;
  }

  function setBusy(value) {
    busy = value;
    ui?.icon.setAttribute("aria-busy", String(value));
    updateIcon();
  }

  function showToast(message, { label, onClick, isError = false } = {}) {
    const { toast, toastMessage, toastAction } = ensureUi();
    toastMessage.textContent = message;
    toastAction.textContent = label ?? "";
    toastAction.hidden = !label;
    toastAction.onclick = onClick ?? null;
    toast.classList.toggle("error", isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, TOAST_DURATION_MS);
  }

  function hideToast() {
    if (ui) ui.toast.hidden = true;
  }

  function updateIcon() {
    const visible = Boolean(iconsEnabled && activeField && (busy || hasText(activeField)));
    if (!visible && !ui) return;
    ensureUi().icon.hidden = !visible;
    if (visible) positionIcon();
  }

  function positionIcon() {
    const rect = activeField.getBoundingClientRect();
    const offscreen = !rect.width || rect.bottom < 0 || rect.top > innerHeight;
    const top = rect.top + Math.min(ICON_OFFSET, Math.max(0, (rect.height - ICON_SIZE) / 2));

    ui.icon.style.visibility = offscreen ? "hidden" : "visible";
    ui.icon.style.top = `${top}px`;
    ui.icon.style.left = `${rect.right - ICON_SIZE - ICON_OFFSET}px`;
  }

  // ---------------------------------------------------------------------------
  // Site rules
  // ---------------------------------------------------------------------------

  function parseBlockedDomains(value = "") {
    return value
      .split(",")
      .map((domain) => domain.trim().toLowerCase().replace(/^[a-z]+:\/\//, ""))
      .filter(Boolean);
  }

  function isBlockedByUser() {
    const { hostname, host, pathname } = location;
    const url = host + pathname;

    return blockedDomains.some((blocked) => {
      if (blocked.includes("/")) return url.startsWith(blocked);
      const target = blocked.includes(":") ? host : hostname;
      return target === blocked || target.endsWith(`.${blocked}`);
    });
  }

  function isSensitiveSite() {
    const hostname = location.hostname.toLowerCase();
    const labels = hostname.split(/[.-]/);
    return (
      contentConfig.blockedHostKeywords.some((keyword) => hostname.includes(keyword)) ||
      labels.some((label) => contentConfig.blockedHostLabels.includes(label))
    );
  }

  function applySettings({ enableContentScript, blockedDomains: domains }) {
    blockedDomains = parseBlockedDomains(domains);
    iconsEnabled = enableContentScript !== false && Boolean(contentConfig) && !isSensitiveSite() && !isBlockedByUser();
    updateIcon();
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  let positionFrame = 0;
  function schedulePosition() {
    if (positionFrame || !ui || ui.icon.hidden) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      if (activeField && !ui.icon.hidden) positionIcon();
    });
  }

  document.addEventListener(
    "focusin",
    (event) => {
      const field = resolveField(event.composedPath()[0]);
      if (!field) return;
      activeField = field;
      updateIcon();
    },
    true
  );

  document.addEventListener(
    "focusout",
    () => {
      // Wait for focus to settle; clicking our icon never moves focus away from the field.
      setTimeout(() => {
        if (busy || !activeField || activeField.contains(deepActiveElement())) return;
        activeField = null;
        updateIcon();
      });
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      if (activeField?.contains(event.composedPath()[0])) updateIcon();
    },
    true
  );

  addEventListener("scroll", schedulePosition, { capture: true, passive: true });
  addEventListener("resize", schedulePosition, { passive: true });

  chrome.runtime.onMessage.addListener((request) => {
    // With all_frames, only the frame that holds focus should react to the shortcut.
    if (request.action !== "enhanceActiveField" || !document.hasFocus()) return;

    const field = resolveField(deepActiveElement());
    if (field) enhanceField(field);
    else showToast("Click into a text field first.");
  });

  async function init() {
    contentConfig = await chrome.runtime.sendMessage({ action: "getContentConfig" });
    applySettings(await chrome.storage.sync.get(["enableContentScript", "blockedDomains"]));

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !chrome.runtime?.id) return;
      if (changes.enableContentScript || changes.blockedDomains) {
        chrome.storage.sync.get(["enableContentScript", "blockedDomains"]).then(applySettings);
      }
    });
  }

  init().catch(() => {
    // The service worker may be unavailable while the extension reloads; icons stay off.
  });
})();
