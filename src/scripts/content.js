(() => {
  "use strict";

  // The service worker re-injects this script into tabs opened before an install or update.
  if (globalThis.__aiMessageEnhancerLoaded) return;
  globalThis.__aiMessageEnhancerLoaded = true;

  const PILL_HEIGHT = 24;
  const COMPACT_FIELD_WIDTH = 260;
  const MIN_TEXT_CHARS = 3;
  const HIDE_DELAY_MS = 300;
  const POLL_MS = 250;
  const CHIP_DURATION_MS = 8000;
  const NOTICE_DURATION_MS = 4000;
  const RERUN_DELAY_MS = 300;
  const MAX_DIFF_CELLS = 4_000_000;
  const INPUT_TYPES = ["text", "search", "email", "url"];
  const BLOCK_TAGS = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TR", "TABLE", "SECTION", "ARTICLE"]);
  const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
  // Focusable widgets that can be editable but are not free text: pickers, toggles, menus, grids.
  const WIDGET_ROLES = new Set(["combobox", "listbox", "option", "searchbox", "spinbutton", "slider", "checkbox", "radio", "switch", "button", "link", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "tree", "treeitem", "grid", "gridcell"]);
  // Not grids: some apps lay out a whole conversation, composer included, as a grid.
  const WIDGET_CONTAINERS = '[role="search"], [role="combobox"], [role="listbox"], [role="menu"], [role="menubar"], [role="tree"]';
  const ATOMS = '[contenteditable="false"], img, .mention, [data-mention]';
  const RELOAD_MESSAGE = "The extension was updated. Reload this page to keep using it.";
  const SVG_NS = "http://www.w3.org/2000/svg";
  // The toolbar icon (icons/icon16.svg) and the popup's check (src/interface/icons.svg), inlined
  // because pages cannot load the extension's files.
  const ICONS = {
    brand: {
      viewBox: "0 0 16 16",
      paths: [
        ["#4f46e5", "M1 7.6a7.4 7.4 0 1 0 14.8 0a7.4 7.4 0 1 0 -14.8 0Z"],
        ["#4f46e5", "M2.4 11.2L0.6 15.6L5.8 14.4Z"],
        ["#fff", "M8.3 2.6Q9.652 6.448 13.5 7.8Q9.652 9.152 8.3 13Q6.948 9.152 3.1 7.8Q6.948 6.448 8.3 2.6Z"],
        ["#fff", "M12.6 1.5Q13.23 2.97 14.7 3.6Q13.23 4.23 12.6 5.7Q11.97 4.23 10.5 3.6Q11.97 2.97 12.6 1.5Z"],
      ],
    },
    check: { viewBox: "0 0 24 24", paths: [["currentColor", "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"]] },
  };

  let configPromise = null;
  let config = null;
  let activeField = null;
  let hideTimer = null;
  let pollTimer = null;
  let positionFrame = 0;
  let resizeObserver = null;
  let fieldObserver = null;
  let composerNote; // undefined until the first check, so a stale note is cleared once per page
  let ui = null;
  let session = null;

  // ---------------------------------------------------------------------------
  // Settings (fetched lazily from the service worker on the first relevant focus)
  // ---------------------------------------------------------------------------

  function loadConfig() {
    configPromise ??= chrome.runtime
      .sendMessage({ action: "getContentConfig" })
      .then((value) => {
        config = {
          ...value,
          searchPattern: new RegExp(value.searchPattern, "i"),
          sensitivePattern: new RegExp(value.sensitivePattern, "i"),
          composerPattern: new RegExp(value.composerPattern, "i"),
          blockedDomains: parseBlockedDomains(value.blockedDomains),
        };
        return config;
      })
      .catch((error) => {
        configPromise = null;
        throw error;
      });
    return configPromise;
  }

  function parseBlockedDomains(value = "") {
    return value
      .split(",")
      .map((domain) => domain.trim().toLowerCase().replace(/^[a-z]+:\/\//, ""))
      .filter(Boolean);
  }

  function isBlockedByUser() {
    const { hostname, host, pathname } = location;
    const url = host + pathname;

    return config.blockedDomains.some((blocked) => {
      if (blocked.includes("/")) return url.startsWith(blocked);
      const target = blocked.includes(":") ? host : hostname;
      return target === blocked || target.endsWith(`.${blocked}`);
    });
  }

  function isSensitiveSite() {
    const hostname = location.hostname.toLowerCase();
    const labels = hostname.split(/[.-]/);
    return (
      config.blockedHostKeywords.some((keyword) => hostname.includes(keyword)) ||
      labels.some((label) => config.blockedHostLabels.includes(label))
    );
  }

  function siteProfile() {
    const hostname = location.hostname.toLowerCase();
    return config?.sites.find((site) => site.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`)));
  }

  // ---------------------------------------------------------------------------
  // Fields
  // ---------------------------------------------------------------------------

  function isFormControl(el) {
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
  }

  function deepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function describe(el) {
    return ["name", "id", "autocomplete", "aria-label", "placeholder"].map((attr) => el.getAttribute(attr) ?? "").join(" ");
  }

  // Any field the shortcut or the menu may enhance: text-like and not sensitive.
  function resolveEditable(el) {
    if (!(el instanceof HTMLElement)) return null;

    let field = null;
    if (isFormControl(el)) {
      const isText = el instanceof HTMLTextAreaElement || INPUT_TYPES.includes(el.type);
      if (isText && !el.disabled && !el.readOnly) field = el;
    } else if (el.isContentEditable) {
      // Walk up to the editing host so nested editable nodes resolve to the same field.
      field = el;
      while (field.parentElement?.isContentEditable) field = field.parentElement;
    }
    if (!field) return null;
    if (config ? config.sensitivePattern.test(describe(field)) : /pass|otp|one-time-code|cc-/i.test(describe(field))) return null;
    return field;
  }

  // Fields that get the pill: multi-line, big enough, not search-like, on an allowed site.
  function pillEligible(field) {
    if (!config || config.inPageTrigger === "off") return false;
    if (config.inPageTrigger === "sites" && !siteProfile()) return false;
    if (isSensitiveSite() || isBlockedByUser()) return false;
    if (field instanceof HTMLInputElement) return false;
    if (field.getAttribute("aria-readonly") === "true" || field.getAttribute("aria-disabled") === "true") return false;
    if (config.searchPattern.test(describe(field))) return false;
    // Editors and pickers often keep an off-screen or transparent field focused to capture keys.
    if (field.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) return false;
    const rect = rectOf(field);
    if (rect.width < config.minField.width || rect.height < config.minField.height) return false;

    const reason = notTextReason(field);
    noteComposer(field, reason);
    return !reason;
  }

  // Why a field is not a multi-line free-text box (pickers, toggles, menus, grid cells), or null.
  function notTextReason(field) {
    if (!(field instanceof HTMLTextAreaElement) && field.getAttribute("aria-multiline") === "false") {
      return 'is marked as single-line (aria-multiline="false")';
    }
    const role = field.getAttribute("role");
    if (WIDGET_ROLES.has(role)) return `has role="${role}"`;
    const container = field.parentElement?.closest(WIDGET_CONTAINERS);
    if (container) return `is inside role="${container.getAttribute("role")}"`;
    // A field that opens suggestions is a picker, unless it is a textarea or declares itself a text
    // box (composers with @mention suggestions do).
    const opensPopup = field.hasAttribute("aria-autocomplete") || (field.getAttribute("aria-haspopup") ?? "false") !== "false";
    const isTextBox = field instanceof HTMLTextAreaElement || role === "textbox" || field.getAttribute("aria-multiline") === "true";
    return opensPopup && !isTextBox ? "opens suggestions without being a text box" : null;
  }

  // On Slack, Teams, Gmail and Outlook the message box should always get the button. If the rules
  // above turn it away, the site's markup has likely changed: leave a note the popup shows, and
  // clear it once the button shows there again.
  function noteComposer(field, reason) {
    if (!siteProfile()) return;
    const label = [describe(field), field.getAttribute("aria-placeholder"), field.getAttribute("data-placeholder")].join(" ");
    if (!config.composerPattern.test(label) || composerNote === reason) return;
    composerNote = reason;
    const host = location.hostname;
    chrome.storage.local
      .get("pillWarnings")
      .then(({ pillWarnings = {} }) => {
        if (!reason && !pillWarnings[host]) return;
        if (reason) pillWarnings[host] = { reason, at: Date.now() };
        else delete pillWarnings[host];
        return chrome.storage.local.set({ pillWarnings });
      })
      .catch(() => {});
  }

  // An editable <body> (iframe editors) is only as tall as its text; its frame's viewport is the field.
  function rectOf(field) {
    if (field !== document.body) return field.getBoundingClientRect();
    return { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight };
  }

  // The field plus nearby wrappers (toolbars, emoji buttons) that belong to the same composer.
  function composerOf(field) {
    const height = field.getBoundingClientRect().height;
    let composer = field;
    let node = field.parentElement;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      if (node.getBoundingClientRect().height <= height + 200) composer = node;
    }
    return composer;
  }

  // ---------------------------------------------------------------------------
  // Text model
  // ---------------------------------------------------------------------------

  function excludedSelector() {
    return config?.excludedContent ?? ".gmail_signature, .gmail_quote";
  }

  // Walks the DOM instead of using innerText, which turns one <p> per line into blank lines.
  function extract(root, range) {
    const excluded = excludedSelector();
    let out = "";
    const newline = () => {
      if (out && !out.endsWith("\n")) out += "\n";
    };
    const walk = (node) => {
      if (range && !range.intersectsNode(node)) return;
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.data;
        if (range) {
          const start = node === range.startContainer ? range.startOffset : 0;
          const end = node === range.endContainer ? range.endOffset : text.length;
          text = text.slice(start, end);
        }
        out += text.replace(/[​-‍﻿]/g, "").replace(/ /g, " ");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches(excluded)) return;
      if (node.tagName === "BR") {
        // A trailing <br> in a non-empty block is a layout placeholder, not a line.
        const parent = node.parentElement;
        const placeholder = !node.nextSibling && BLOCK_TAGS.has(parent?.tagName) && parent.textContent.replace(/[​﻿]/g, "");
        if (!placeholder) out += "\n";
        return;
      }
      if (node.tagName === "IMG") {
        out += node.alt || "";
        return;
      }
      const block = BLOCK_TAGS.has(node.tagName);
      if (block) newline();
      for (const child of node.childNodes) walk(child);
      if (block) newline();
    };
    walk(root);
    return out.replace(/^\n+|\n+$/g, "");
  }

  function textOf(field, target) {
    if (isFormControl(field)) return target ? field.value.slice(target.start, target.end) : field.value;
    return extract(field, target?.range);
  }

  function userTextLength(field) {
    if (isFormControl(field)) return field.value.replace(/\s/g, "").length;
    let length = field.textContent.replace(/\s/g, "").length;
    for (const el of field.querySelectorAll(excludedSelector())) length -= el.textContent.replace(/\s/g, "").length;
    return length;
  }

  // The selection inside the field, or null for "everything the user wrote".
  function captureSelection(field) {
    if (isFormControl(field)) {
      const { selectionStart: start, selectionEnd: end } = field;
      return start !== end ? { start, end } : null;
    }
    const selection = getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    return field.contains(range.commonAncestorContainer) ? { range: range.cloneRange() } : null;
  }

  // Whole-field range for contenteditable, stopping before a mail signature or quoted reply.
  function userRegionRange(field) {
    const range = document.createRange();
    range.selectNodeContents(field);
    const firstExcluded = field.querySelector(excludedSelector());
    if (firstExcluded) {
      let block = firstExcluded;
      while (block.parentNode !== field) block = block.parentNode;
      let last = block.previousSibling;
      while (last && !extract(last).trim()) last = last.previousSibling;
      // End inside the last block: a selection that crosses into the next block makes the browser
      // merge the signature's first line into the reply and drop the blank line before it.
      if (!last) range.setEndBefore(block);
      else if (last.nodeType === Node.TEXT_NODE) range.setEnd(last, last.length);
      else range.setEnd(last, last.childNodes.length);
    }
    return range;
  }

  function countAtoms(field, target) {
    if (isFormControl(field)) return 0;
    const fragment = (target?.range ?? userRegionRange(field)).cloneContents();
    return fragment.querySelectorAll(ATOMS).length;
  }

  const normalize = (text) =>
    text
      .replace(/[​﻿]/g, "")
      .replace(/ /g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function selectTarget(field, target) {
    field.focus({ preventScroll: true });
    if (isFormControl(field)) {
      if (target) field.setSelectionRange(target.start, target.end);
      else field.select();
      return;
    }
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(target?.range.cloneRange() ?? userRegionRange(field));
    // Model-driven editors (Lexical, CKEditor 5, ProseMirror) sync their selection on the async
    // selectionchange event; inserting before it fires edits the old caret position instead.
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 100);
      document.addEventListener("selectionchange", () => (clearTimeout(timer), setTimeout(resolve, 0)), { once: true });
    });
    await nextFrame();
  }

  // Inserts through the editor's own input pipeline, then verifies the result instead of trusting it.
  async function replaceText(field, text, target) {
    const before = textOf(field);
    const sent = textOf(field, target);
    const expected = normalize(target ? before.replace(sent, text) : text);
    await selectTarget(field, target);

    if (isFormControl(field)) {
      if (!document.execCommand("insertText", false, text)) {
        const { start, end } = target ?? { start: 0, end: field.value.length };
        field.setRangeText(text, start, end, "end");
        field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
      }
    } else {
      // A synthetic paste goes through rich editors' models (Slack, Teams, Lexical) and keeps undo.
      const data = new DataTransfer();
      data.setData("text/plain", text);
      data.setData("text/html", text.split("\n").map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`).join(""));
      const paste = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true, composed: true });
      const handled = !deepActiveElement().dispatchEvent(paste);
      if (!handled) {
        // Plain contenteditable: browser editing commands, one line at a time.
        text.split("\n").forEach((line, i) => {
          if (i) document.execCommand("insertParagraph");
          if (line) document.execCommand("insertText", false, line);
        });
      }
    }

    for (let i = 0; i < 6; i++) {
      if (normalize(textOf(field)) === expected) return true;
      await wait(50);
    }
    // Something else happened (or nothing did): put the field back the way it was.
    if (normalize(textOf(field)) !== normalize(before)) await undoReplace(field, before, null);
    return false;
  }

  async function undoReplace(field, snapshot, inserted) {
    field.focus();
    const target = isFormControl(field) ? field : deepActiveElement();
    const mac = /Mac/.test(navigator.platform);
    const restored = () => normalize(textOf(field)) === normalize(snapshot);
    const attempts = [
      // Editors with their own history (Quill, CKEditor 5, Lexical) listen for the shortcut.
      () => target.dispatchEvent(new KeyboardEvent("keydown", { key: "z", code: "KeyZ", keyCode: 90, ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true, composed: true })),
      () => target.dispatchEvent(new InputEvent("beforeinput", { inputType: "historyUndo", bubbles: true, cancelable: true, composed: true })),
      () => document.execCommand("undo"),
    ];
    for (const attempt of attempts) {
      attempt();
      await wait(80);
      if (restored()) return true;
      // Stop once something changed, so we never undo more than our own edit.
      if (inserted !== null && normalize(textOf(field)) !== normalize(inserted)) return false;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  function streamEnhancement(request, onDelta) {
    let port;
    let settled = false;
    const promise = new Promise((resolve, reject) => {
      try {
        port = chrome.runtime.connect({ name: "enhance" });
      } catch {
        reject(new Error(RELOAD_MESSAGE));
        return;
      }
      port.onMessage.addListener((message) => {
        if (message.delta) return onDelta(message.delta);
        settled = true;
        port.disconnect();
        if (message.error) reject(new Error(message.error));
        else resolve(message.text);
      });
      port.onDisconnect.addListener(() => {
        if (settled) return;
        settled = true;
        reject(new Error(chrome.runtime?.id ? "Lost the connection to the extension. Please try again." : RELOAD_MESSAGE));
      });
      port.postMessage(request);
    });
    const cancel = () => {
      if (settled) return;
      settled = true;
      port?.disconnect();
    };
    return { promise, cancel };
  }

  // ---------------------------------------------------------------------------
  // UI: one closed shadow root holding the pill, the review popover, the undo chip and notices
  // ---------------------------------------------------------------------------

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .surface {
      --bg: #fff; --text: #111827; --muted: #6b7280; --border: #e5e7eb; --soft: #f8fafc;
      --accent: #4f46e5; --accent-soft: #eef2ff; --accent-text: #4338ca;
      --warn-bg: #fffbeb; --warn-text: #92400e; --error-bg: #fef2f2; --error-text: #b91c1c;
      --ins-bg: #dcfce7; --ins-text: #166534; --del-bg: #fee2e2; --del-text: #991b1b;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: var(--text);
    }
    @media (prefers-color-scheme: dark) {
      .surface {
        --bg: #1f2937; --text: #f3f4f6; --muted: #9ca3af; --border: #374151; --soft: #111827;
        --accent: #6366f1; --accent-soft: #312e81; --accent-text: #c7d2fe;
        --warn-bg: #451a03; --warn-text: #fde68a; --error-bg: #450a0a; --error-text: #fca5a5;
        --ins-bg: #14532d; --ins-text: #bbf7d0; --del-bg: #7f1d1d; --del-text: #fecaca;
      }
    }
    button { font: inherit; color: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .pill, .chip {
      position: fixed; height: ${PILL_HEIGHT}px; display: flex; align-items: center; gap: 5px;
      padding: 0 9px 0 4px; border: 1px solid var(--accent); border-radius: ${PILL_HEIGHT / 2}px; background: var(--bg);
      color: var(--accent-text); font-size: 12px; font-weight: 600; line-height: 1; white-space: nowrap;
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
    }
    .pill:hover, .pill[aria-expanded="true"] { background: var(--accent-soft); }
    .pill.compact { padding: 0 3px; }
    .icon { width: 16px; height: 16px; flex: none; }
    .pill.compact .label { display: none; }
    .chip button { border: 0; background: none; padding: 0 2px; color: var(--accent-text); font-weight: 700; text-decoration: underline; }
    .notice { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 8px 12px; border-radius: 8px;
      background: var(--text); color: var(--bg); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); font-size: 13px; }
    .popover {
      position: fixed; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border);
      border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18); overflow: hidden;
    }
    .bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .title { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; margin-right: auto; }
    .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .seg button, .toggle { border: 0; background: var(--bg); padding: 3px 8px; font-size: 12px; color: var(--text); }
    .toggle { border: 1px solid var(--border); border-radius: 8px; }
    .seg button[aria-pressed="true"], .toggle[aria-pressed="true"] { background: var(--accent); color: #fff; }
    .close { border: 0; background: none; width: 24px; height: 24px; border-radius: 6px; font-size: 16px; color: var(--muted); }
    .body { padding: 10px 12px; overflow: auto; white-space: pre-wrap; word-break: break-word; min-height: 3em; }
    .caret { display: inline-block; width: 7px; height: 14px; margin-left: 1px; background: var(--accent); vertical-align: -2px; animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    ins { background: var(--ins-bg); color: var(--ins-text); text-decoration: none; border-radius: 3px; }
    del { background: var(--del-bg); color: var(--del-text); border-radius: 3px; }
    .status { display: flex; align-items: center; gap: 8px; padding: 0 12px 8px; color: var(--muted); font-size: 12px; }
    .link { border: 0; background: none; padding: 0; color: var(--accent-text); font-size: 12px; text-decoration: underline; }
    .message { margin: 0 12px 8px; padding: 6px 8px; border-radius: 6px; font-size: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .message.warn { background: var(--warn-bg); color: var(--warn-text); }
    .message.error { background: var(--error-bg); color: var(--error-text); }
    .foot { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--border); background: var(--soft); }
    .hint { margin-right: auto; color: var(--muted); font-size: 12px; }
    .btn { border: 1px solid var(--border); background: var(--bg); border-radius: 8px; padding: 5px 10px; font-size: 13px; }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
    .btn:disabled { opacity: 0.5; cursor: default; }
  `;

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith("aria-") || key === "role") node.setAttribute(key, value);
      else node[key] = value;
    }
    node.append(...children);
    return node;
  }

  function icon(name) {
    const { viewBox, paths } = ICONS[name];
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("aria-hidden", "true");
    for (const [fill, d] of paths) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("fill", fill);
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }

  function ensureUi() {
    if (ui) return ui;

    const host = document.createElement("message-enhancer-ui");
    host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    const surface = el("div", { className: "surface" });

    const pill = el("button", { type: "button", className: "pill", hidden: true, "aria-expanded": "false" }, icon("brand"), el("span", { className: "label" }, "Enhance"));
    pill.addEventListener("click", () => activeField && togglePopover(activeField, { viaKeyboard: false }));

    const chip = el("div", { className: "chip", hidden: true, role: "status" });
    const notice = el("div", { className: "notice", hidden: true, role: "status" });
    const popover = buildPopover();

    surface.append(pill, chip, notice, popover.root);
    root.append(el("style", { textContent: STYLES }), surface);
    // Keep focus (and the selection) in the page's field when clicking our controls.
    surface.addEventListener("mousedown", (event) => {
      if (event.target.closest?.("button")) event.preventDefault();
    });

    ui = { host, root, pill, chip, notice, popover };
    // The popover hangs above the field by its bottom edge, so it must move whenever its height
    // changes (status line, warnings, errors), not only when the text streams in.
    new ResizeObserver(() => positionPopover()).observe(popover.root);
    return ui;
  }

  // Modal dialogs, popovers and fullscreen elements live in the top layer; the host must be
  // inside them to be visible and clickable.
  function mountFor(field) {
    const { host } = ensureUi();
    let container = document.documentElement;
    try {
      container = field.closest("dialog:modal, :popover-open, :fullscreen") ?? container;
    } catch {
      // Older engines without these pseudo-classes keep the default container.
    }
    if (host.parentNode !== container) container.append(host);
  }

  // Fixed positioning is relative to a transformed ancestor (e.g. a centered dialog), not the viewport.
  function origin() {
    const rect = ui.host.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }

  function placeAt(node, x, y) {
    const o = origin();
    node.style.left = `${Math.round(x - o.x)}px`;
    node.style.top = `${Math.round(y - o.y)}px`;
  }

  function showNotice(message) {
    const { notice } = ensureUi();
    if (!ui.host.isConnected) document.documentElement.append(ui.host);
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => (notice.hidden = true), NOTICE_DURATION_MS);
  }

  // ---------------------------------------------------------------------------
  // Pill
  // ---------------------------------------------------------------------------

  function visibleRect(field) {
    const rect = rectOf(field);
    let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let node = field.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const box = node.getBoundingClientRect();
      clip = {
        left: Math.max(clip.left, box.left),
        top: Math.max(clip.top, box.top),
        right: Math.min(clip.right, box.right),
        bottom: Math.min(clip.bottom, box.bottom),
      };
    }
    return {
      left: Math.max(clip.left, rect.left),
      top: Math.max(clip.top, rect.top),
      right: Math.min(clip.right, rect.right),
      bottom: Math.min(clip.bottom, rect.bottom),
    };
  }

  function placePill(field) {
    const { pill } = ui;
    const rect = rectOf(field);
    pill.classList.toggle("compact", rect.width < COMPACT_FIELD_WIDTH);
    pill.style.visibility = "hidden";
    pill.hidden = false;
    const width = pill.offsetWidth;
    const h = PILL_HEIGHT;
    const visible = visibleRect(field);
    const isVisible = (x, y) => x >= visible.left && x <= visible.right && y >= visible.top && y <= visible.bottom;

    const hitAt = (x, y) => document.elementsFromPoint(x, y).find((node) => node !== ui.host);
    // Below an editable <body>'s text the hit test returns <html>, which is still the field.
    const isField = (node) => node === field || field.contains(node) || (field === document.body && node === document.documentElement);
    // The anchoring corner must show the field (or the composer's own buttons), not a sticky
    // header or overlay on top of it.
    const cornerShows = (x, y) => {
      const hit = hitAt(x, y) ?? field;
      return isVisible(x, y) && (isField(hit) || Boolean(hit.closest(INTERACTIVE)));
    };

    // Best first: fully above the corner (never over the text), then straddling the top border.
    // Each spot names the field corner it hangs from; "inside" spots must sit on the field.
    // Corner probes sit 20 px in from the edge so rounded corners still count as the field.
    const top = [rect.right - 20, rect.top + 4];
    const bottom = [rect.right - 20, rect.bottom - 4];
    const candidates = [
      { x: rect.right - width, y: rect.top - h - 4, corner: top },
      { x: rect.right - width - 8, y: rect.top - h / 2, corner: top },
      { x: rect.right - width - 4, y: rect.bottom - h - 4, corner: bottom, inside: true },
      { x: rect.right + 4, y: rect.bottom - h, corner: bottom },
      { x: rect.right - width, y: rect.bottom + 4, corner: bottom },
    ];
    const blocked = ({ x, y, corner, inside }) => {
      if (x < 0 || y < 0 || x + width > innerWidth || y + h > innerHeight) return true;
      if (!cornerShows(...corner)) return true;
      const points = [[1, 1], [width - 1, 1], [1, h - 1], [width - 1, h - 1], [width / 2, h / 2]];
      return points.some(([dx, dy]) => {
        const hit = hitAt(x + dx, y + dy);
        if (!hit) return false;
        if (inside) return !isField(hit);
        const control = hit.closest(INTERACTIVE);
        return Boolean(control) && !isField(control);
      });
    };

    const spot = candidates.find((candidate) => !blocked(candidate));
    pill.style.visibility = "";
    if (!spot) {
      pill.hidden = true;
      return;
    }
    placeAt(pill, spot.x, spot.y);
    if (!ui.chip.hidden) placeAt(ui.chip, spot.x, spot.y);
  }

  function updatePill() {
    if (!ui && !activeField) return;
    const field = activeField;
    const visible = Boolean(
      field?.isConnected && chrome.runtime?.id && pillEligible(field) && (session?.field === field || userTextLength(field) >= MIN_TEXT_CHARS)
    );

    if (!visible) {
      if (ui) ui.pill.hidden = true;
      stopTracking();
      return;
    }
    mountFor(field);
    ui.pill.setAttribute("aria-label", `Enhance text${config.shortcut ? ` (${config.shortcut})` : ""}`);
    ui.pill.title = ui.pill.getAttribute("aria-label");
    placePill(field);
    startTracking(field);
  }

  function schedulePosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      if (activeField && ui && !ui.pill.hidden) placePill(activeField);
      if (session) positionPopover();
    });
  }

  // Model-driven editors (CKEditor 5 in Teams, Lexical) cancel beforeinput and write the DOM
  // themselves, so typing fires no input event; watch the focused field's DOM instead. Mutation
  // records are batched per task, so this runs once per keystroke like the input listener.
  function watchField(field) {
    if (fieldObserver?.field === field) return;
    fieldObserver?.disconnect();
    fieldObserver = null;
    if (!field || isFormControl(field)) return;
    fieldObserver = new MutationObserver(() => updatePill());
    fieldObserver.field = field;
    fieldObserver.observe(field, { childList: true, characterData: true, subtree: true });
  }

  function startTracking(field) {
    if (resizeObserver?.field === field) return;
    stopTracking();
    resizeObserver = new ResizeObserver(schedulePosition);
    resizeObserver.field = field;
    resizeObserver.observe(field);
    // Catches layout shifts (reply previews, attachments) and composers cleared without an input event.
    pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") updatePill();
    }, POLL_MS);
  }

  function stopTracking() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    clearInterval(pollTimer);
  }

  // ---------------------------------------------------------------------------
  // Review popover
  // ---------------------------------------------------------------------------

  function buildPopover() {
    const segment = (label, options) => {
      const group = el("span", { className: "seg", role: "group", "aria-label": label });
      for (const [value, text] of options) group.append(el("button", { type: "button", value, "aria-pressed": "false" }, text));
      return group;
    };
    const title = el("span", { className: "title", id: "me-title" }, icon("brand"), "Enhanced");
    const tone = segment("Tone", [["neutral", "Neutral"], ["formal", "Formal"]]);
    const type = segment("Message type", [["message", "Message"], ["email", "Email"]]);
    const translate = el("button", { type: "button", className: "toggle", "aria-pressed": "false", title: "Translate to English" }, "→ EN");
    const close = el("button", { type: "button", className: "close", "aria-label": "Close (Esc)" }, "×");
    const body = el("div", { className: "body", "aria-live": "polite" });
    const statusText = el("span");
    const cancel = el("button", { type: "button", className: "link" }, "Cancel");
    const diffToggle = el("button", { type: "button", className: "link", "aria-pressed": "false" }, "Show changes");
    const status = el("div", { className: "status" }, statusText, cancel, diffToggle);
    const warning = el("div", { className: "message warn", hidden: true });
    const error = el("div", { className: "message error", role: "alert", hidden: true });
    const copy = el("button", { type: "button", className: "btn" }, "Copy");
    const retry = el("button", { type: "button", className: "btn" }, "Retry");
    const replace = el("button", { type: "button", className: "btn primary" }, "Replace");
    const mod = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
    const foot = el("div", { className: "foot" }, el("span", { className: "hint" }, `${mod}+Enter replace · Esc close`), copy, retry, replace);
    const root = el(
      "div",
      { className: "popover", role: "dialog", "aria-labelledby": "me-title", hidden: true, tabIndex: -1 },
      el("div", { className: "bar" }, title, tone, type, translate, close),
      body,
      status,
      warning,
      error,
      foot
    );

    tone.addEventListener("click", (event) => event.target.value && changePrefs({ tone: event.target.value }));
    type.addEventListener("click", (event) => event.target.value && changePrefs({ type: event.target.value }));
    translate.addEventListener("click", () => changePrefs({ translate: translate.getAttribute("aria-pressed") !== "true" }));
    close.addEventListener("click", () => closePopover({ restoreFocus: true }));
    cancel.addEventListener("click", cancelRun);
    diffToggle.addEventListener("click", () => {
      const showing = diffToggle.getAttribute("aria-pressed") !== "true";
      diffToggle.setAttribute("aria-pressed", String(showing));
      diffToggle.textContent = showing ? "Hide changes" : "Show changes";
      renderBody();
    });
    copy.addEventListener("click", copyResult);
    retry.addEventListener("click", () => run());
    replace.addEventListener("click", () => applyResult(false));

    // Keys typed inside the popover never reach the page's shortcuts; Tab stays inside.
    for (const type of ["keydown", "keyup", "keypress"]) root.addEventListener(type, (event) => event.stopPropagation());
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...root.querySelectorAll("button:not(:disabled)")].filter((b) => b.offsetParent);
      const index = focusable.indexOf(ui.root.activeElement);
      const next = (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[next]?.focus();
    });

    return { root, tone, type, translate, body, statusText, cancel, diffToggle, warning, error, copy, retry, replace };
  }

  async function togglePopover(field, options) {
    if (session?.field === field) closePopover({ restoreFocus: true });
    else await openPopover(field, options);
  }

  async function openPopover(field, { viaKeyboard }) {
    if (!chrome.runtime?.id) return showNotice(RELOAD_MESSAGE);
    await loadConfig();
    closePopover({ restoreFocus: false });

    const selection = captureSelection(field);
    const target = selection ?? (isFormControl(field) ? null : { range: userRegionRange(field) });
    const raw = textOf(field, target);
    const [, leading, text, trailing] = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!text) return showNotice("Type some text first.");

    const prefs = await sitePrefs();
    session = {
      field,
      isSelection: Boolean(selection),
      target,
      raw,
      text,
      leading: selection ? leading : "",
      trailing: selection ? trailing : "",
      snapshot: textOf(field),
      prefs,
      result: "",
      done: false,
      stream: null,
      startedAt: 0,
      clock: null,
      rerunTimer: null,
    };

    activeField = field;
    watchField(field);
    mountFor(field);
    const { popover, pill } = ui;
    popover.root.hidden = false;
    popover.diffToggle.setAttribute("aria-pressed", "false");
    popover.diffToggle.textContent = "Show changes";
    const atoms = countAtoms(field, selection);
    popover.warning.hidden = !atoms;
    popover.warning.textContent = `Replacing will turn ${atoms} @mention or emoji into plain text. Select only the words you want rewritten to keep them.`;
    pill.setAttribute("aria-expanded", "true");
    renderPrefs();
    updatePill();
    addEventListener("keydown", onWindowKeydown, true);
    if (viaKeyboard) popover.root.focus();
    run();
  }

  function closePopover({ restoreFocus }) {
    if (!session) return;
    const { field, target } = session;
    cancelRun();
    clearTimeout(session.rerunTimer);
    session = null;
    removeEventListener("keydown", onWindowKeydown, true);
    ui.popover.root.hidden = true;
    ui.pill.setAttribute("aria-expanded", "false");
    if (restoreFocus && field.isConnected) {
      field.focus({ preventScroll: true });
      if (target?.range) {
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(target.range);
      }
    }
    updatePill();
  }

  // Escape and Ctrl/Cmd+Enter belong to the popover while it is open, e.g. Slack must not send.
  function onWindowKeydown(event) {
    if (!session) return;
    const submit = event.key === "Enter" && (event.ctrlKey || event.metaKey);
    if (event.key !== "Escape" && !submit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") closePopover({ restoreFocus: true });
    else if (session.done) applyResult(false);
  }

  async function sitePrefs() {
    const { sitePrefs: all = {} } = await chrome.storage.local.get("sitePrefs");
    const defaults = { ...config.prefs, type: siteProfile()?.type ?? "message" };
    return { ...defaults, ...all[location.hostname] };
  }

  async function changePrefs(change) {
    if (!session) return;
    session.prefs = { ...session.prefs, ...change };
    renderPrefs();
    const { sitePrefs: all = {} } = await chrome.storage.local.get("sitePrefs");
    await chrome.storage.local.set({ sitePrefs: { ...all, [location.hostname]: session.prefs } });
    clearTimeout(session.rerunTimer);
    session.rerunTimer = setTimeout(run, RERUN_DELAY_MS);
  }

  function renderPrefs() {
    const { tone, type, translate } = ui.popover;
    const { prefs } = session;
    for (const button of tone.children) button.setAttribute("aria-pressed", String(button.value === prefs.tone));
    for (const button of type.children) button.setAttribute("aria-pressed", String(button.value === prefs.type));
    translate.setAttribute("aria-pressed", String(Boolean(prefs.translate)));
  }

  function run() {
    if (!session) return;
    cancelRun();
    const current = session;
    current.result = "";
    current.done = false;
    current.startedAt = Date.now();
    showError(null);
    renderBody();
    renderStatus();
    current.clock = setInterval(renderStatus, 100);

    const { tone, type, translate } = current.prefs;
    current.stream = streamEnhancement({ text: current.text, tone, type, translate }, (delta) => {
      if (session !== current) return;
      current.result += delta;
      renderBody();
    });
    current.stream.promise
      .then((text) => {
        if (session !== current) return;
        current.result = text;
        current.done = true;
      })
      .catch((error) => {
        if (session === current) showError(error.message);
      })
      .finally(() => {
        if (session !== current) return;
        clearInterval(current.clock);
        current.stream = null;
        renderBody();
        renderStatus();
      });
  }

  function cancelRun() {
    if (!session?.stream) return;
    session.stream.cancel();
    session.stream = null;
    clearInterval(session.clock);
    if (!session.done) showError("Cancelled.");
    renderStatus();
  }

  function renderBody() {
    const { body, diffToggle } = ui.popover;
    const { result, done, stream } = session;
    body.textContent = "";
    if (done && diffToggle.getAttribute("aria-pressed") === "true") {
      body.append(diffFragment(session.text, result));
    } else {
      body.append(result);
      if (stream) body.append(el("span", { className: "caret" }));
    }
    positionPopover();
  }

  function renderStatus() {
    const { statusText, cancel, diffToggle, copy, retry, replace } = ui.popover;
    const { stream, done, startedAt, result } = session;
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    statusText.textContent = stream ? `Enhancing… ${seconds} s` : done ? `${result.length} chars · ${config.modelName}` : "";
    cancel.hidden = !stream;
    diffToggle.hidden = !done;
    copy.disabled = !done;
    replace.disabled = !done;
    retry.disabled = Boolean(stream);
  }

  function showError(message, actions = []) {
    const { error } = ui.popover;
    error.hidden = !message;
    error.textContent = message ?? "";
    if (message && /settings/i.test(message) && !actions.length) {
      actions = [["Open settings", () => chrome.runtime.sendMessage({ action: "openOptions" })]];
    }
    for (const [label, handler] of actions) {
      const button = el("button", { type: "button", className: "link" }, label);
      button.addEventListener("click", handler);
      error.append(button);
    }
    if (message) positionPopover();
  }

  // Above the field when there is room (composers sit at the bottom), otherwise below it.
  function positionPopover() {
    if (!session) return;
    const { root } = ui.popover;
    const rect = rectOf(session.field);
    const width = Math.min(innerWidth - 16, Math.max(320, Math.min(460, rect.width)));
    root.style.width = `${width}px`;
    const x = Math.max(8, Math.min(rect.right - width, innerWidth - width - 8));
    // Leave room for the pill, which sits just above the field's top-right corner.
    const gapAbove = PILL_HEIGHT + 12;
    const roomAbove = rect.top - gapAbove - 8;
    const roomBelow = innerHeight - rect.bottom - 16;
    const above = roomAbove >= 200 || roomAbove > roomBelow;
    root.style.maxHeight = `${Math.max(160, Math.min(innerHeight * 0.5, above ? roomAbove : roomBelow))}px`;
    const height = root.offsetHeight;
    placeAt(root, x, above ? rect.top - gapAbove - height : rect.bottom + 8);
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(session.leading + session.result + session.trailing);
      ui.popover.copy.textContent = "Copied";
      setTimeout(() => ui && (ui.popover.copy.textContent = "Copy"), 1500);
    } catch {
      showError("Couldn't copy the text.");
    }
  }

  async function applyResult(confirmed) {
    if (!session?.done) return;
    const current = session;
    const { field } = current;
    if (!field.isConnected) return showError("The text field is no longer on the page.");
    // Editors re-render their DOM, so the whole-field region is recomputed rather than reused.
    const target = current.isSelection ? current.target : isFormControl(field) ? null : { range: userRegionRange(field) };

    if (!confirmed && textOf(field, target) !== current.raw) {
      showError("The text changed since it was enhanced.", [
        ["Replace anyway", () => applyResult(true)],
        ["Retry", () => run()],
      ]);
      return;
    }

    const replacement = current.leading + current.result + current.trailing;
    const inserted = await replaceText(field, replacement, target);
    if (session !== current) return;

    if (!inserted) {
      try {
        await navigator.clipboard.writeText(replacement);
        showError(`Couldn't insert the text here. It is copied, press ${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl"}+V.`);
      } catch {
        showError("Couldn't insert the text here. Use Copy and paste it.");
      }
      return;
    }
    const snapshot = current.snapshot;
    closePopover({ restoreFocus: false });
    showUndoChip(field, snapshot, textOf(field));
  }

  function showUndoChip(field, snapshot, inserted) {
    const { chip, pill } = ui;
    const undo = el("button", { type: "button" }, "Undo");
    chip.replaceChildren(icon("check"), "Replaced · ", undo);
    undo.addEventListener("click", async () => {
      chip.hidden = true;
      if (!(await undoReplace(field, snapshot, inserted))) showNotice("Couldn't undo automatically. Press Ctrl+Z in the field.");
    });
    if (pill.hidden) {
      const rect = rectOf(field);
      placeAt(chip, rect.right - 140, rect.top - PILL_HEIGHT / 2);
    } else {
      placeAt(chip, parseFloat(pill.style.left) + origin().x, parseFloat(pill.style.top) + origin().y);
    }
    chip.hidden = false;
    clearTimeout(chip.timer);
    chip.timer = setTimeout(() => (chip.hidden = true), CHIP_DURATION_MS);
  }

  function diffFragment(before, after) {
    const a = before.match(/\s+|[^\s]+/g) ?? [];
    const b = after.match(/\s+|[^\s]+/g) ?? [];
    const fragment = document.createDocumentFragment();
    if (a.length * b.length > MAX_DIFF_CELLS) {
      fragment.append(after);
      return fragment;
    }
    // Longest common subsequence over words and whitespace runs.
    const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const push = (tag, text) => {
      const last = fragment.lastChild;
      if (tag && last?.nodeName === tag.toUpperCase()) last.textContent += text;
      else fragment.append(tag ? el(tag, {}, text) : text);
    };
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        push(null, a[i]);
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push("del", a[i++]);
      else push("ins", b[j++]);
    }
    while (i < a.length) push("del", a[i++]);
    while (j < b.length) push("ins", b[j++]);
    return fragment;
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  function isInsideComposer(node) {
    if (!activeField || !node) return false;
    return node === ui?.host || composerOf(activeField).contains(node);
  }

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.composedPath()[0];
      if (target === ui?.host || isInsideComposer(target)) clearTimeout(hideTimer);
      const field = resolveEditable(target);
      if (!field || !chrome.runtime?.id) return;
      clearTimeout(hideTimer);
      if (activeField !== field && session) closePopover({ restoreFocus: false });
      activeField = field;
      watchField(field);
      loadConfig().then(updatePill, () => {});
    },
    true
  );

  document.addEventListener(
    "focusout",
    () => {
      clearTimeout(hideTimer);
      // Moving to the composer's own buttons (emoji, formatting) or to our popover keeps the pill.
      hideTimer = setTimeout(() => {
        if (session || isInsideComposer(deepActiveElement())) return;
        activeField = null;
        watchField(null);
        updatePill();
      }, HIDE_DELAY_MS);
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      if (activeField?.contains(event.composedPath()[0])) updatePill();
    },
    true
  );

  addEventListener("scroll", schedulePosition, { capture: true, passive: true });
  addEventListener("resize", schedulePosition, { passive: true });

  chrome.runtime.onMessage.addListener((request) => {
    // With all_frames, only the frame that holds focus should react to the shortcut.
    if (request.action !== "openEnhancer" || !document.hasFocus()) return;
    const active = deepActiveElement();
    // The focused element is an iframe: that frame's own copy of this script handles it.
    if (active instanceof HTMLIFrameElement || active instanceof HTMLFrameElement) return;

    loadConfig().then(
      () => {
        const field = resolveEditable(active);
        if (field) openPopover(field, { viaKeyboard: true });
        else showNotice(active?.isContentEditable || isFormControl(active) ? "This field isn't supported." : "Click into a text field first.");
      },
      () => showNotice(RELOAD_MESSAGE)
    );
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!chrome.runtime?.id) return;
    const relevant = ["inPageTrigger", "blockedDomains", "prefs", "model"];
    if (relevant.some((key) => key in changes)) {
      configPromise = null;
      config = null;
      loadConfig().then(updatePill, () => {});
    }
  });
})();
