# In-Page Enhancement Redesign - Implementation Plan

**Goal:** Make the in-page ✨ flow reliable enough for daily use on Slack, Teams, Gmail and generic sites: a collision-aware pill, a review popover with streaming, and paste-based insertion that is verified before success is reported.

**Spec:** `docs/superpowers/specs/2026-10-20-in-page-enhancement-redesign-design.md`

**Tech stack:** Chrome Manifest V3, vanilla JS with no build step, one content script with a closed shadow root, the existing `enhance` port in the service worker.

## Global constraints

- No new permissions and no runtime dependencies.
- `content.js` stays a single IIFE with the double-injection guard; `background.js` injects it by path.
- Storage keys (verbatim): `inPageTrigger` in sync storage (`"multiline" | "sites" | "off"`, default `"multiline"`), `sitePrefs` in local storage (`{ [hostname]: { tone, type, translate } }`).
- Message names (verbatim): `getContentConfig` (now also returns `inPageTrigger`, `shortcut` and `sites`), `openEnhancer` (replaces `enhanceActiveField`), `openOptions`.
- Commit messages: Conventional Commits, no co-author or tooling trailers.

## Tasks

### Task 1: Text core

**Files:** `src/scripts/content.js`

- [ ] Add `extract(root, range)` (DOM walk: block boundaries, `<br>`, `img[alt]`, zero-width and NBSP cleanup, mail signature and quote exclusions).
- [ ] Add `resolveTarget(field)`: selection inside the field (as a `Range` or text offsets), else the user-authored region.
- [ ] Add `replaceText(field, text, target)`: select, wait for `selectionchange` plus a frame, then `insertText` (form controls) or synthetic paste with a per-line `insertText`/`insertParagraph` fallback; verify by re-extracting.
- [ ] Add `undoReplace(field, snapshot, inserted)`: keydown Ctrl/Cmd+Z, `beforeinput historyUndo`, `execCommand("undo")`, verifying after each.
- [ ] Remove `getText`, `insertText`, `undo` and the `innerText` fallbacks.

### Task 2: Streaming client

**Files:** `src/scripts/content.js`, `src/scripts/background.js`

- [ ] `streamEnhancement(request, onDelta)` over `chrome.runtime.connect({ name: "enhance" })`, returning `{ promise, cancel }`; a disconnect without `done` rejects with "Lost the connection"; an invalidated context rejects with "reload this page".
- [ ] `onConnect` ignores ports from other extensions (`sender.id`).

### Task 3: Pill

**Files:** `src/scripts/content.js`

- [ ] Eligibility rules from spec section 1, with the patterns read from `getContentConfig`.
- [ ] `placePill()`: candidate spots, `elementsFromPoint` collision test, clip-rectangle test.
- [ ] Composer-scoped focus with a 300 ms hide delay; ResizeObserver, scroll and resize listeners, 250 ms poll while visible.
- [ ] Move the UI host into `dialog:modal`, `:popover-open` or `:fullscreen` ancestors.

### Task 4: Review popover

**Files:** `src/scripts/content.js`

- [ ] Header controls (tone, type, translate) backed by `sitePrefs` and site defaults; re-run on change.
- [ ] Streaming body, word diff toggle, elapsed time and Cancel.
- [ ] Replace (with stale-text confirmation), Copy, Retry; mention and emoji warning.
- [ ] Keyboard capture: Esc, Ctrl/Cmd+Enter, Tab cycling, key events stopped at the popover root.
- [ ] Inline errors with "Open settings" for consent and key errors.
- [ ] "Replaced · Undo" chip for 8 s; remove the bottom-centre toast.

### Task 5: Config, background, prompt

**Files:** `src/config/config.json`, `src/config/instructions.json`, `src/scripts/background.js`, `src/config/README.md`

- [ ] `contentScript.sites` profiles (Gmail, Outlook, Slack, Teams), `minField`, `searchPattern`, `sensitivePattern`; `defaults.inPageTrigger`.
- [ ] `getContentConfig` returns settings, profiles and the current shortcut (`chrome.commands.getAll`), and the content script calls it lazily.
- [ ] Command and menu send `openEnhancer`; menu title gets "…".
- [ ] Migration: `enableContentScript: false` becomes `inPageTrigger: "off"`.
- [ ] Plain-text and keep-mentions rule in the prompt.

### Task 6: Settings page

**Files:** `src/interface/options.html`, `src/scripts/options.js`, `src/styles/options.css`

- [ ] Replace the checkbox with the three-way "Show the ✨ Enhance button" select.
- [ ] Show the current shortcut with a "Change" button that opens `chrome://extensions/shortcuts`.

### Task 7: Verification

- [ ] Playwright run against the five editor mocks (Quill, CKEditor 5, Lexical, Gmail-like, textarea) and the misc page (search, small fields, dialog, iframes, layout shift), covering acceptance criteria 1 to 16.
- [ ] Existing popup, settings, consent and migration suites still pass.
- [ ] Manual pass on real Slack, Teams, Gmail and Outlook with debug mode on.

### Task 8: Release

- [ ] Version bump to 3.1.0 in the manifest and package.json, changelog entry, README and screenshots refreshed.
