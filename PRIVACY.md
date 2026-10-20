# Privacy Policy for Message Enhancer

**Last Updated**: October 20, 2026

## Overview
Message Enhancer is a Chrome extension that helps users improve their written communications by enhancing message tone, clarity, and grammar using AI models from OpenRouter or OpenAI.

## Data Collection and Usage

### What We Collect
Message Enhancer collects and processes the following data:

1. **User Settings**
   - OpenRouter and/or OpenAI API keys (stored in Chrome local storage on this device only)
   - Selected AI model preference
   - Tone, message type and translation preferences
   - Theme preferences
   - Content script enable/disable status
   - Debug mode setting
   - Blocked domains list

2. **Message Content**
   - Text you choose to enhance is sent to the provider of the selected model (OpenRouter or OpenAI) for processing
   - Input and output text may be stored in Chrome local storage on this device for the "Keep text when extension closes" feature

### What We Don't Collect
- We do NOT collect, store, or transmit your personal data to our servers
- We do NOT track your browsing history
- We do NOT collect analytics or usage statistics
- We do NOT share your data with third parties (except the AI provider you select, for processing)

## Data Storage

### Local Storage
API keys and saved message text are stored with Chrome's local storage API. This data:
- Stays on this device and is not synced to your Google account
- Is never sent to our servers

### Sync Storage
Non-sensitive preferences (model, theme, tone, website integration settings, blocked domains) are stored with Chrome's sync storage API, so they follow you across your Chrome instances if you're signed in.

### AI Providers
When you enhance text:
- Your text is sent directly to the provider of the selected model using YOUR API key
- OpenRouter forwards the request to the model's provider (for example xAI, Google, OpenAI or Anthropic)
- We do not store or log API requests
- The provider's data retention policies apply (OpenRouter: https://openrouter.ai/privacy, OpenAI: https://openai.com/privacy)

## Third-Party Services

### OpenRouter and OpenAI
This extension uses the OpenRouter API or the OpenAI API to process text enhancement requests. By using this extension, you acknowledge that:
- Your enhanced text is processed by the selected provider
- The provider's privacy policy applies
- You are responsible for your API usage and associated costs

## Data Security
- Your API keys are kept in Chrome's local extension storage, which only this extension can access
- All communications with the AI providers use HTTPS encryption
- No data is transmitted to servers we control

## Permissions Explanation

### Required Permissions
1. **storage**: Store user preferences and settings
2. **contextMenus**: Add the "Enhance with AI Message Enhancer" entry to the right-click menu of text fields

### Content Scripts
The extension can inject small icons into text inputs on websites (when enabled). This feature:
- Only activates when explicitly enabled in settings
- Can be disabled entirely
- Specific domains can be blocked from showing icons
- Does not read or transmit data without your explicit action (clicking the icon, using the keyboard shortcut or the right-click menu)

## User Control
You have complete control over your data:
- You can disable the extension at any time
- You can clear all stored data by removing the extension
- You can block specific websites from showing enhancement icons
- You can disable content script functionality entirely

## Children's Privacy
This extension is not intended for children under 13. We do not knowingly collect data from children.

## Changes to This Policy
We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date above.

## Contact
For privacy-related questions or concerns, please contact:
- GitHub: https://github.com/g-guerzoni/chrome-extension-messages-enhancer

## Compliance
This extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)

## Your Rights
Under GDPR and CCPA, you have the right to:
- Access your data (stored locally on your device)
- Delete your data (uninstall the extension)
- Opt-out of data processing (don't use the extension)

Since all data is stored locally on your device, you have full control over your information at all times.
