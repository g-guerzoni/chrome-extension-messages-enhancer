# Message Enhancer Chrome Extension

A Chrome extension that helps improve the tone, clarity, and politeness of your messages using OpenAI's GPT-4o API. Perfect for enhancing your Slack, Teams, or email communications.

## Features

### Message Enhancement
- Improve text clarity and readability using GPT-4
- Fix grammar and punctuation
- Maintain original meaning while enhancing expression
- Support for messages up to 1000 characters
- Real-time character count
- Copy enhanced text to clipboard with one click

### Language & Translation
- **Automatic language detection**
- **Optional translation to English form the original language**
- Preserves original meaning during translation
- Works with any input language

### Message Customization
- Multiple tone options:
  - Very Informal: Casual and friendly, perfect for chat messages
  - Informal: Relaxed but professional
  - Neutral: Balanced and professional tone
  - Formal: Business-appropriate language
- Message type adaptation:
  - Chat messages: Optimized for instant messaging
  - Email: Adds proper email formatting and etiquette
- Automatic tone adjustment when switching between message types

### User Interface
- Clean, modern interface
- Dark/Light theme support:
  - System default (follows your browser theme)
  - Light mode
  - Dark mode
- Loading indicators for API operations
- Error handling with clear user feedback
- Secure API key input with visibility toggle

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
   - Click the "Settings" button (gear icon)
   - Enter your OpenAI API key
   - Select your preferred theme
   - Click "Save Settings"

## Usage

1. Click the extension icon in Chrome's toolbar
2. Enter or paste your text (max 1000 characters)
3. Configure your enhancement options:
   - Select tone (Very Informal to Formal)
   - Choose message type (Chat or Email)
   - Enable translation to English if needed
4. Click "Enhance Message"
5. Review the enhanced text
6. Click the copy icon to copy the enhanced text to your clipboard

## Settings

### API Configuration
- OpenAI API Key (**Required for the extension to work**)
> ⚠️ **IMPORTANT:** The extension **DO NOT** store the API KEY anywhere else.

## Development
The extension is built with vanilla JavaScript and follows a modular structure:

### Project Structure
- `manifest.json`: Extension configuration and permissions
- `src/`
  - `interface/`
    - `popup.html`: Main extension interface
    - `options.html`: Settings page
  - `scripts/`
    - `popup.js`: Main UI logic
    - `options.js`: Settings management
    - `background.js`: Background service worker for API communication
  - `styles/`
    - `common.css`: Shared styles and theme variables
    - `popup.css`: Main interface styles
    - `options.css`: Settings page styles

### Debugging
- Background script logs: Access via Chrome's extension developer tools
  - Go to `chrome://extensions/`
  - Find Message Enhancer
  - Click "Service Worker" under "Inspect views"
- Popup logs: Right-click the extension popup and select "Inspect"


## Requirements

- Chrome browser
- OpenAI API key with access to GPT-4
- Node.js and npm (for development)

## License

MIT License - See LICENSE file for details 