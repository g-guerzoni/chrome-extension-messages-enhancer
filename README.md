# Message Enhancer Chrome Extension

A Chrome extension that helps improve the tone, clarity, and politeness of your messages using OpenAI's GPT-4 API. Perfect for enhancing your Slack, Teams, or email communications.

## Features

- Enhance message clarity and readability
- Adjust tone (Very Informal, Informal, Neutral, Formal)
- Support for both chat messages and emails
- Real-time character count
- Copy enhanced text to clipboard
- Secure API key storage

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/chrome-extension-messages-enhancer.git
   cd chrome-extension-messages-enhancer
   ```

2. Install dependencies and generate icons:
   ```bash
   npm install
   npm run generate-icons
   ```

3. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the extension directory

4. Configure the extension:
   - Click the extension icon in Chrome's toolbar
   - Click the "Settings" button
   - Enter your OpenAI API key
   - Click "Save Settings"

## Usage

1. Click the extension icon in Chrome's toolbar
2. Enter or paste your text (max 1000 characters)
3. Select the desired tone:
   - Very Informal: Casual and friendly
   - Informal: Relaxed but professional
   - Neutral: Balanced and professional
   - Formal: Business-appropriate
4. Choose the message type:
   - Message: For chat applications
   - Email: Adds email-specific formatting
5. Click "Enhance Message"
6. Review the enhanced text
7. Click "Copy to Clipboard" to use the enhanced text

## Development

The extension is built with vanilla JavaScript and uses the following structure:

- `manifest.json`: Extension configuration
- `popup.html/css/js`: Main extension UI
- `options.html/js`: Settings page
- `background.js`: Background service worker
- `icons/`: Extension icons

## Security

- API keys are stored securely using Chrome's Storage API
- All communication with OpenAI is handled through the background service worker
- No data is stored or transmitted except to OpenAI's API

## Requirements

- Chrome browser
- OpenAI API key with access to GPT-4

## License

MIT License - See LICENSE file for details 