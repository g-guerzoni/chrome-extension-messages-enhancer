# Configuration Files

This directory holds the extension's configuration, so models, prompts and limits can change without touching code.

| File | Loaded by | Purpose |
| --- | --- | --- |
| `config.json` | `shared.js` (service worker, popup, options) | Providers, limits, defaults, content-script rules |
| `model.json` | `shared.js` | The model list shown in the settings page |
| `instructions.json` | `background.js` | The system prompt used for every enhancement |

Content scripts cannot read these files directly (they are not web-accessible). `content.js` asks the
service worker for the values it needs with the `getContentConfig` message.

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
    "blockedHostLabels": ["secure", "login", "signin", "auth", "accounts", "admin"]
  }
}
```

- **providers**: every provider must expose an OpenAI-compatible, streaming `chat/completions` endpoint.
  `headers` and `params` are added to every request sent to that provider. The settings page renders
  one API key field per provider.
- **limits.maxCharacters**: maximum input length (popup, in-page enhancement and service worker).
- **contentScript**: the ✨ icon is hidden on hosts that contain a keyword (`mybank.com`) or have a
  matching label (`login.example.com`, `secure-pay.example.com`).

## model.json

```json
{
  "defaultModel": "x-ai/grok-4.1-fast",
  "legacyDefaultModel": "gpt-5-nano-2025-08-07",
  "models": [
    {
      "id": "x-ai/grok-4.1-fast",
      "name": "Grok 4.1 Fast",
      "provider": "openrouter",
      "pricing": { "input": 0.2, "output": 0.5 },
      "note": "Recommended: fast, cheapest output",
      "params": { "reasoning": { "effort": "none" }, "temperature": 0.3 }
    }
  ]
}
```

- **id**: the model id expected by the provider (OpenRouter ids are `vendor/model`).
- **provider**: a key of `config.json` → `providers`.
- **pricing**: USD per 1M tokens, shown in the settings page.
- **params**: merged into the request body. Use it to turn reasoning off or down
  (`reasoning.effort` on OpenRouter, `reasoning_effort` on OpenAI) and to set `temperature`.
- **legacyDefaultModel**: the model selected for users upgrading from v2 who only have an OpenAI key.

To add a model, append an entry to `models`; the settings page picks it up automatically.

## instructions.json

The system prompt is assembled in `background.js` (`buildSystemMessage`) in this order:
`baseTask` → `translation` → `core` → `formatting` → `avoidance` → `tones[tone]` →
`messageTypes[type]` → `final`.

To add a tone or message type, add a key to `tones` or `messageTypes` and a matching radio button
in `src/interface/popup.html`.
