# Privacy Policy for AI Message Enhancer

**Last Updated**: October 20, 2026

## Overview
AI Message Enhancer is a Chrome extension that improves the grammar, clarity and tone of text you write, using an AI model you choose from OpenRouter or OpenAI.

## Data the Extension Handles

### Text you choose to enhance
- When you press Enhance in the popup, click ✨ Enhance next to a text field, press the keyboard shortcut or use the right-click menu, the text of that field (or your selection) is sent to the provider of the model you chose, together with your API key.
- Nothing is sent before one of those actions, and nothing is sent until you accept the data notice shown on install (you can withdraw consent at any time in settings).
- If "Keep text when extension closes" is on, the popup's input and output text are stored on your device only.

### Settings
- **On this device only** (Chrome local storage): your OpenRouter and/or OpenAI API keys, the selected model, your consent to the data notice and the popup's saved text.
- **Synced with your Google account** (Chrome sync storage, if Chrome Sync is on): theme, tone, message type, translation, website integration settings, blocked domains and debug mode.

### What the extension does not do
- It does not send any data to servers run by the developer.
- It does not track your browsing history, collect analytics or show ads.
- It does not sell your data or use it for anything other than enhancing the text you ask it to enhance.

## Who Receives Your Text

| Recipient | When | Privacy policy |
| --- | --- | --- |
| OpenRouter | When an OpenRouter model is selected | https://openrouter.ai/privacy |
| The model's maker, via OpenRouter: xAI (Grok), Google (Gemini), OpenAI (GPT) or Anthropic (Claude), or the hosting provider OpenRouter routes the request to | When the matching OpenRouter model is selected | See OpenRouter's provider list: https://openrouter.ai/providers |
| OpenAI | When an OpenAI model is selected | https://openai.com/policies/privacy-policy |

Requests use your own API key, so they are subject to your agreement with that provider, and you are responsible for the usage costs.

## Data Security
- All requests to AI providers use HTTPS.
- API keys are stored in Chrome's local extension storage on your device. They are not synced and are only sent to the provider they belong to.

## Permissions

- **storage**: save your settings, API keys and the popup's text.
- **contextMenus**: add "Enhance with AI Message Enhancer" to the right-click menu of text fields.
- **scripting** and **activeTab**: when you use the keyboard shortcut or the right-click menu on a tab that was open before the extension was installed or updated, load the extension's script into that tab so the request can be handled.
- **Content script on all websites** (all frames): show the ✨ button next to the text field you are typing in and replace the text in place when you ask. The script only looks at the focused field on your device to decide whether to show the button; it sends nothing unless you take one of the actions listed above.

## Your Control
- Turn off the ✨ button entirely, or hide it on specific sites, in settings.
- Withdraw consent to the data notice in settings; the extension then sends nothing.
- Remove all stored data by uninstalling the extension.

## Children's Privacy
This extension is not intended for children under 13.

## Changes to This Policy
Changes are reflected in the "Last Updated" date above. If the way text is handled changes, the extension shows the data notice again.

## Contact
For privacy-related questions, open an issue at https://github.com/g-guerzoni/chrome-extension-messages-enhancer/issues.
