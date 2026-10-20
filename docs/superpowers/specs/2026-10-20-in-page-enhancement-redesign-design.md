# In-Page Enhancement Redesign - Design

**Status:** implemented in v3.0.0
**Scope:** `src/scripts/content.js`, `src/scripts/background.js`, settings page, `config.json`, `instructions.json`

## Why

The in-page ✨ button is the feature people would use every day on Slack, Teams and Gmail, yet the owner keeps it disabled because it has always been unreliable. Measured on local mocks built with the real editor libraries (Quill 2, CKEditor 5 v43, Lexical 0.52, a Gmail-like contenteditable and a textarea):

| Problem | Evidence |
| --- | --- |
| Silent no-op on CKEditor 5 (Teams) and Lexical | `execCommand("insertText")` changes nothing, yet the toast says "Text enhanced." |
| Gmail signature and the whole quoted thread are sent and rewritten | Request contains `--` and `On Mon ... wrote:` |
| Blank lines double on every round trip | `innerText` turns one `<p>` per line into `\n\n` |
| Formatting and @mentions are flattened | Bold, links and mention atoms become plain text |
| Text replaced with no preview | Whatever the model returns lands in the page; Undo window is 6 s |
| Icon covers the send button and line-end text | Top-right inside the field, no collision check |
| Icon on search boxes, Gmail Subject, tiny inputs | No size or role filter |
| Icon flickers when focus moves to the composer's own buttons, goes stale on layout shifts, floats over sticky headers, hidden inside modal dialogs | Focus-only visibility, no ResizeObserver, no clip check, host outside the top layer |
| Toast covers Slack's and Gmail's send bars | Bottom-centre of the viewport |
| Typing during the request is overwritten or lost | No stale-text check, no cancel |

Grammarly, Edge Copilot Rewrite and LanguageTool converged on the same answer: a small corner trigger that avoids collisions and skips tiny fields, and a review card with an explicit Insert or Replace button. Lexical's docs and a W3C editing thread both say outside DOM edits must go through the editor's own input pipeline; a synthetic paste does.

## Design

### 1. Eligible fields

- **Pill shown on:** `textarea` and contenteditable editing hosts that are visible, at least 160x18 px, not disabled or read-only, on a site that is not sensitive or blocked.
- **Never a pill on:** any `<input>`, fields inside `[role=search]`, `[role=combobox]` or `[aria-autocomplete]`, `role=searchbox`, fields whose label, placeholder, name or id match `search|filter|find|pesquis|busca`, and sensitive fields (`pass|pwd|otp|one-time|2fa|mfa|totp|pin|cvv|cvc|csc|card number|cc-|iban|ssn|secret|token|api key` on name, id, autocomplete, aria-label, placeholder).
- **Shortcut and right-click menu:** work on any editable field except sensitive ones, including single-line inputs.

### 2. Trigger pill

- A 22 px "✨ Enhance" pill (just ✨ under 260 px of field width), low emphasis until hovered.
- Shown while the field (or its composer, an ancestor at most 4 levels up and at most 200 px taller) has focus and at least 3 non-space characters. Hidden 300 ms after focus leaves the composer, so moving to the emoji button does not flicker it.
- Placed at the first free spot of: straddling the top border at the right, inside bottom-right, outside right, below the right corner. A spot is rejected when offscreen, outside the field's visible clip rectangle, or when any of 5 sample points hits a button, link, input or other focusable element that is not the field. No free spot means no pill.
- Repositioned on show, on field resize (ResizeObserver), on scroll and window resize (rAF-throttled) and every 250 ms while visible to catch layout shifts.
- The UI host moves into `dialog:modal`, `:popover-open` or `:fullscreen` when the field lives there.
- `aria-label` names the current shortcut; `aria-expanded` reflects the popover; `mousedown` keeps focus and selection in the field.

### 3. Review popover (default flow)

- Anchored to the field's right edge, above it when there are 200 px of room, otherwise below. Never covers the field. Width `min(460, max(320, field width))`.
- Header: Neutral | Formal, Message | Email, "→ EN" translate, close. Changing one re-runs the request and is remembered per hostname in `storage.local.sitePrefs`; the popup's preferences are untouched. Site defaults: Gmail and Outlook start as Email, everything else as Message.
- Body: the result streams in (`aria-live=polite`). "Show changes" switches to a word diff (LCS on words, skipped above 3,000 tokens).
- Status: elapsed time and Cancel while streaming, which closes the port and aborts the fetch.
- Footer: Replace (primary, Ctrl/Cmd+Enter), Copy, Retry. A warning when the target contains @mentions or emoji, which replacing turns into plain text.
- Replace re-checks the target: if the text changed since the request, it asks before replacing.
- Keyboard: Esc closes and returns the caret to the field; Esc and Ctrl/Cmd+Enter are captured before the page sees them, so Slack's "Ctrl+Enter to send" cannot fire. Opened by the shortcut, focus moves into the popover; opened by mouse, it stays in the field.
- Errors (consent, missing key, lost connection, reloaded extension) appear inline with `role=alert`; consent and key errors offer "Open settings".
- After Replace, a "Replaced · Undo" chip sits next to the pill for 8 s. It replaces the bottom-centre toast.

### 4. Text model

- **Target:** the non-collapsed selection inside the field, else the user-authored region: for mail, everything before the first `.gmail_signature`, `.gmail_quote`, `[data-smartmail=gmail_signature]`, `#divRplyFwdMsg`, `#Signature` or `.moz-signature`.
- **Extraction** walks the DOM instead of `innerText`: one `\n` per block boundary, `<br>` is `\n` unless it is a trailing placeholder, `img` gives its `alt`, zero-width characters are stripped and NBSP becomes a space, excluded blocks are skipped.
- **Insertion:** focus and select the target, wait for `selectionchange` (100 ms cap) plus a frame so model-driven editors sync their selection, then:
  - form controls: `execCommand("insertText")`, falling back to `setRangeText` plus an `input` event;
  - contenteditable: a synthetic `paste` with `text/plain` and `text/html` (one `<p>` per line); if the editor does not handle it, `insertText` per line with `insertParagraph` between lines.
- **Verify:** re-extract and compare with the expected text (whitespace-normalised). On mismatch, put the result on the clipboard and say "Couldn't insert here, the text is copied. Press Ctrl+V". Never report success on a no-op.
- **Undo:** synthetic Ctrl/Cmd+Z keydown, then `beforeinput historyUndo`, then `execCommand("undo")`, checking the snapshot after each step. Native Ctrl+Z also works because every path goes through the editor's own history.

### 5. Request

The content script uses the existing `enhance` port (streaming, abort on disconnect) with `{text, tone, type, translate}`. Settings and site profiles come from one `getContentConfig` call on the first focus of an eligible field instead of on every frame load.

### 6. Settings

"Show enhancement icons on websites" becomes **"Show the ✨ Enhance button"** with three values: on multi-line text fields (default), only on Slack, Teams, Gmail and Outlook, or never (shortcut and right-click only). An explicit `enableContentScript: false` migrates to "never". The settings page shows the current shortcut with a button that opens `chrome://extensions/shortcuts`.

### 7. Shortcut and menu

Both open the review popover for the focused field or selection; neither replaces text directly. The menu item reads "Enhance with AI Message Enhancer…".

### 8. Prompt

Add: "Return plain text only, without Markdown. Keep line breaks. Keep @mentions, #channels, :emoji_codes:, URLs and email addresses exactly as written."

## Out of scope

- "Replace immediately without review" mode (can be added later behind a setting).
- A second, unbound "enhance and replace" command.
- Keeping @mentions as rich atoms on whole-field replace; selecting only the words to rewrite keeps them.

## Acceptance criteria

1. No pill on header search, Gmail Subject or To, a 140x20 field, password or OTP fields, or blocked or sensitive hosts.
2. The pill never overlaps an interactive element or the field's text; on a textarea with an inline send button it is not over the button.
3. The pill follows the field within a frame on scroll and within 300 ms after a layout shift, and hides when clipped.
4. The pill is visible and clickable inside a modal `<dialog>` and in same-origin, srcdoc and `about:blank` iframes.
5. Focus moving from the field to the composer's emoji button and back causes no hide/show toggle.
6. Page text never changes before Replace.
7. Streamed text appears as it arrives; Cancel closes the request.
8. On Quill, CKEditor 5, Lexical, Gmail-like contenteditable and textarea, the extracted text after Replace equals the model output, and three consecutive runs add no blank lines.
9. On Gmail, the signature and quote are not sent and are unchanged after Replace.
10. Selection-only rewrites leave bold, links and mentions outside the selection unchanged.
11. The Undo chip and native Ctrl+Z restore the previous rich content on all five editors.
12. When insertion cannot be verified, the field is unchanged, the text is on the clipboard and no success message appears.
13. Editing the field while the popover is open makes Replace ask first.
14. Shortcut opens the popover with focus inside; Tab reaches every control; Esc closes and restores the caret; Ctrl+Enter replaces; keys typed in the popover never reach the page.
15. Gmail defaults to Email, Slack and Teams to Message; a tone change on one site leaves the popup and other sites alone.
16. After an extension reload, an old tab says "reload this page" instead of showing a dead pill.

## Risks

- Real Slack, Teams and Gmail builds differ from the open-source editors; verification and the clipboard fallback turn surprises into a visible "copied" message, never silent loss.
- Synthetic paste and keydown events are untrusted; an editor that starts rejecting them falls back the same way.
- Whole-field replace flattens @mentions; the popover warns and suggests selecting only the words to rewrite.
