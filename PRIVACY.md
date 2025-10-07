# Privacy Policy for Message Enhancer

**Last Updated**: October 7, 2025

## Overview
Message Enhancer is a Chrome extension that helps users improve their written communications by enhancing message tone, clarity, and grammar using OpenAI's GPT models.

## Data Collection and Usage

### What We Collect
Message Enhancer collects and processes the following data:

1. **User Settings**
   - OpenAI API key (stored locally in Chrome sync storage)
   - Selected AI model preference
   - Theme preferences
   - Content script enable/disable status
   - Debug mode setting
   - Blocked domains list

2. **Message Content**
   - Text you choose to enhance is sent to OpenAI's API for processing
   - Input and output text may be temporarily stored locally for the "Keep text when extension closes" feature

### What We Don't Collect
- We do NOT collect, store, or transmit your personal data to our servers
- We do NOT track your browsing history
- We do NOT collect analytics or usage statistics
- We do NOT share your data with third parties (except OpenAI for processing)

## Data Storage

### Local Storage
All extension settings and preferences are stored locally on your device using Chrome's sync storage API. This data is:
- Encrypted by Chrome
- Synced across your Chrome instances if you're signed in
- Never sent to our servers

### OpenAI API
When you enhance text:
- Your text is sent directly to OpenAI's API using YOUR API key
- OpenAI processes the text according to their privacy policy
- We do not store or log API requests
- OpenAI's data retention policies apply (see: https://openai.com/privacy)

## Third-Party Services

### OpenAI
This extension uses OpenAI's API to process text enhancement requests. By using this extension, you acknowledge that:
- Your enhanced text is processed by OpenAI
- OpenAI's Privacy Policy applies: https://openai.com/privacy
- You are responsible for your OpenAI API usage and associated costs

## Data Security
- Your API key is stored securely in Chrome's encrypted storage
- All communications with OpenAI use HTTPS encryption
- No data is transmitted to servers we control

## Permissions Explanation

### Required Permissions
1. **storage**: Store user preferences and settings locally
2. **activeTab**: Allow the extension to interact with text inputs on websites when you explicitly click the enhancement icon

### Content Scripts
The extension can inject small icons into text inputs on websites (when enabled). This feature:
- Only activates when explicitly enabled in settings
- Can be disabled entirely
- Specific domains can be blocked from showing icons
- Does not read or transmit data without your explicit action

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
