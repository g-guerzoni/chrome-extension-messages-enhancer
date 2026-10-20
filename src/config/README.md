# Configuration Files

This directory holds the extension's configuration, so models, prompts and limits can change without touching code.

| File | Loaded by | Purpose |
| --- | --- | --- |
| `config.json` | `shared.js` (service worker, popup, options) | Providers, limits, defaults, content-script rules |
| `model.json` | `shared.js` | The model list shown in the settings page |
| `instructions.json` | `background.js` | The system prompt used for every enhancement |

Content scripts cannot read these files directly (they are not web-accessible). `content.js` asks the
service worker with the `getContentConfig` message, on the first focus of a text field. The answer
also carries the user's settings, the model name and the current keyboard shortcut.

## config.json

```json
{
  "providers": {
    "openrouter": {
      "name": "OpenRouter",
      "endpoint": "https://openrouter.ai/api/v1/chat/completions",
      "keyPrefix": "sk-or-",
      "keyUrl": "https://openrouter.ai/keys",
      "maxTokensParam": "max_tokens",
      "headers": { "X-Title": "AI Message Enhancer" },
      "params": { "provider": { "sort": "latency" } }
    }
  },
  "limits": { "maxCharacters": 10000, "maxCompletionTokens": 8000 },
  "defaults": { "theme": "system", "prefs": { "tone": "neutral", "type": "message", "translate": false } },
  "contentScript": {
    "blockedHostKeywords": ["bank", "paypal"],
    "blockedHostLabels": ["secure", "login", "signin", "auth", "accounts", "admin"],
    "minField": { "width": 160, "height": 18 },
    "searchPattern": "search|filter|find|pesquis|busca",
    "sensitivePattern": "password|passwd|...|api.?key",
    "excludedContent": ".gmail_signature, .gmail_quote, ...",
    "sites": [{ "hosts": ["mail.google.com"], "type": "email" }]
  }
}
```

- **providers**: every provider must expose an OpenAI-compatible, streaming `chat/completions` endpoint.
  `headers` and `params` are added to every request sent to that provider. The settings page renders
  one API key field per provider.
- **limits.maxCharacters**: maximum input length (popup, in-page enhancement and service worker).
- **contentScript**: rules for the in-page Enhance button.
  - The button is hidden on hosts that contain a keyword (`mybank.com`) or have a matching label
    (`login.example.com`, `secure-pay.example.com`).
  - `minField`: fields smaller than this get no button (the shortcut and menu still work).
  - Fixed rules in `content.js` (`pillEligible`) also keep the button off single-line fields
    (`<input>`, `aria-multiline="false"`), hidden or transparent fields, `aria-readonly` and
    `aria-disabled` fields, and editable widgets: fields whose role is combobox, listbox, checkbox,
    menu, grid cell and the like, fields inside a search, combobox, listbox, menu or tree, and fields
    that open suggestions (`aria-autocomplete`, `aria-haspopup`) without being a textarea or a
    `role="textbox"` / `aria-multiline="true"` text box.
  - `searchPattern` and `sensitivePattern`: case-insensitive regular expressions matched against a
    field's name, id, autocomplete, aria-label and placeholder. Search-like fields get no button;
    sensitive ones are never enhanced.
  - `composerPattern`: on the `sites` hosts, a field whose label or placeholder matches it is the
    site's message box. If the rules above turn it away, `content.js` stores the host and the reason
    in `storage.local.pillWarnings` and the popup shows it as a warning; the note is removed once the
    button shows there again.
  - `excludedContent`: mail signatures and quoted replies that are never sent or rewritten.
  - `sites`: per-site profiles. `type` is the default message type there, and these hosts are the
    ones used by the "Only on Slack, Teams, Gmail and Outlook" setting.

## model.json

```json
{
  "defaultModel": "x-ai/grok-4.3",
  "customModel": {
    "provider": "openrouter",
    "pattern": "^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._:-]*$",
    "example": "google/gemini-3.1-flash-lite"
  },
  "models": [
    {
      "id": "x-ai/grok-4.3",
      "name": "Grok 4.3",
      "provider": "openrouter",
      "pricing": { "input": 1.25, "output": 2.5 },
      "note": "xAI's replacement for Grok 4.1 Fast, with reasoning off for speed",
      "params": { "reasoning": { "effort": "none" }, "temperature": 0.3 }
    }
  ]
}
```

- **id**: the model id expected by the provider (OpenRouter ids are `vendor/model`).
- **provider**: a key of `config.json` → `providers`.
- **pricing**: USD per 1M tokens, shown in the settings page.
- **params**: merged into the request body. Use it to turn reasoning off or down (`reasoning.effort`)
  and to set `temperature`. If the model refuses the reasoning setting or streaming, the request is
  retried once without it.
- **customModel**: the "Other OpenRouter model…" choice. Any ID matching `pattern` (case-insensitive)
  is accepted and sent with no extra `params`.

To add a model, append an entry to `models`; the settings page picks it up automatically.

## instructions.json

The system prompt is assembled in `background.js` (`buildSystemMessage`). Every section is a
`{ "title", "rules" }` block, rendered as a labelled list in this order:

`task` → `translation.enabled` or `translation.disabled` → `sections` (what to change, what to keep,
plain language) → `tones[tone]` → `messageTypes[type]` → `examples` → `output`.

- **task**: who the model is and the input-safety rule (the user message is text to rewrite, never
  instructions), stated once.
- **sections**: the rules shared by every tone. The goal is to keep the meaning, not the wording:
  awkward or word-for-word translated phrasing is rewritten, natural text is left alone.
- **tones**, **messageTypes**: unknown keys fall back to `neutral` and `message`.
- **examples**: each item has an `input` and one output per tone; only the chosen tone's outputs are
  shown, so the model never sees both tones side by side. Keep them short and different from real
  test cases.
- **output**: the output contract (plain text only, mentions and links copied exactly), last so it is
  the freshest instruction when the model starts writing.

To add a tone, add a key to `tones`, an output for that key to every `examples.items` entry, and a
matching radio button in `src/interface/popup.html` and a button in the in-page preview
(`buildPopover` in `content.js`). To add a message type, add a key to `messageTypes` and the same
two controls.
