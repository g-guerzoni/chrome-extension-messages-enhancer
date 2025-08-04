# Message Enhancer Chrome Extension

A Chrome extension that helps improve the tone, clarity, and politeness of your messages using OpenAI's GPT-4.1 Nano API. Perfect for enhancing your Slack, Teams, or email communications with integrated website support for seamless text enhancement.

## Features

### Message Enhancement
- Improve text clarity and readability using GPT-4.1 Nano (use your own key)
- Fix grammar and punctuation errors
- Maintain original meaning while enhancing expression

<img width="511" height="608" alt="Screenshot 2025-08-04 at 13 11 22" src="https://github.com/user-attachments/assets/edf431f5-ceaf-4f5a-98ab-ccc42779e5b6" />

### Website Integration (Grammarly-style)
- **Enhancement icons appear directly in text inputs** across websites like Teams, Slack, Gmail, and other platforms
- **One-click enhancement**: Click the sparkles icon to instantly open the extension with 
your text pre-filled and automatically enhanced

<img width="850" height="276" alt="Screenshot 2025-08-04 at 13 13 42" src="https://github.com/user-attachments/assets/48c4bb3e-d7ec-4d62-a4dc-54a92d6b83b3" />

### Language & Translation
- **Automatic language detection** for any input text
- **Optional translation to English** from the original language
- Preserves original meaning and context during translation
- Works with any input language supported by GPT-4.1 Nano

### Message Customization
- Multiple tone options:
  - **Neutral**: Balanced and professional tone (default)
  - **Formal**: Business-appropriate language with complete sentences
- Message type adaptation:
  - **Message**: Optimized for chat messages, social media, and informal communication
  - **Email**: Adds proper email formatting and professional etiquette
- Intelligent tone adjustment when switching between message types

### User Interface & Experience
- Clean, modern interface with intuitive controls
- Dark/Light theme support:
  - System default (automatically follows your browser theme)
  - Light mode for bright environments
  - Dark mode for low-light usage
- Loading indicators with smooth animations for API operations
- Comprehensive error handling with clear, actionable user feedback
- Secure API key input with visibility toggle for easy verification
- Text persistence: Your input text is saved automatically and restored when reopening the extension

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/g-guerzoni/chrome-extension-messages-enhancer.git
   cd chrome-extension-messages-enhancer
   ```

2. Install dependencies and generate icons:
   ```bash
   npm install
   npm run generate-icons
   ```

3. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" and select the extension directory

4. Configure the extension:
   - Click the extension icon in Chrome's toolbar
   - Click the "Settings" button (gear icon)
   - Enter your OpenAI API key
   - Select your preferred theme
   - Configure website integration settings
   - Click "Save Settings"

## Usage

### Traditional Method (Extension Popup)
1. Click the extension icon in Chrome's toolbar
2. Enter or paste your text (maximum 1000 characters)
3. Configure your enhancement options:
   - Select tone (Neutral or Formal)
   - Choose message type (Message or Email)
   - Enable translation to English if needed
4. Click "Enhance Message"
5. Review the enhanced text in the output area
6. Click the copy icon to copy the enhanced text to your clipboard

### Website Integration Method (New in v2.0)
1. Navigate to any website with text inputs (Teams, Slack, Gmail, etc.)
2. Click on a text input and start typing your message
3. A sparkles icon will appear in the input when it contains text and is focused
4. Click the sparkles icon to instantly:
   - Open the extension popup
   - Auto-fill your text from the input
   - Automatically start the enhancement process
5. The enhanced text appears in the popup, ready to copy back to your original input

## Settings

### API Configuration
- **OpenAI API Key** (Required for the extension to work)
- The extension stores your API key securely in Chrome's local storage
- Your API key never leaves your browser and is not transmitted anywhere except to OpenAI's servers

### User Preferences
- **Theme Selection**: Choose between System, Light, or Dark mode
- **Keep Text on Close**: Automatically save and restore your text between sessions
- **Website Integration**: Enable or disable the Grammarly-style icons on websites

### Website Integration
- **Show enhancement icons on websites**: Toggle the sparkles icons that appear in text inputs across websites
- **Automatic detection**: Works on major platforms including Microsoft Teams, Slack, Gmail, and generic text inputs
- **Performance optimized**: Lightweight implementation that doesn't affect website loading or performance

## Platform Support

The extension works seamlessly across multiple platforms:

### Supported Websites
- **Microsoft Teams**: Message composition and reply inputs
- **Slack**: Channel messages and direct message inputs
- **Gmail**: Email composition and reply areas
- **Generic Support**: Standard HTML text inputs, textareas, and contenteditable elements on any website

### Browser Compatibility
- Google Chrome (Manifest V3)
- Chromium-based browsers (Edge, Brave, etc.)

## Development

The extension is built with vanilla JavaScript and follows a clean, modular architecture:

### Project Structure
```
├── manifest.json              # Extension configuration and permissions
├── src/
│   ├── interface/
│   │   ├── popup.html         # Main extension interface
│   │   └── options.html       # Settings page
│   ├── scripts/
│   │   ├── popup.js           # Main UI logic and enhancement handling
│   │   ├── options.js         # Settings management
│   │   ├── background.js      # Background service worker for API communication
│   │   └── content.js         # Website integration script
│   └── styles/
│       ├── common.css         # Shared styles and theme variables
│       ├── popup.css          # Main interface styles
│       ├── options.css        # Settings page styles
│       └── content.css        # Website integration styles
├── icons/                     # Extension icons (generated from SVG)
└── generate-icons.js          # Icon generation utility
```

### Key Technical Features
- **Manifest V3**: Uses the latest Chrome extension architecture
- **Service Worker**: Background script handles API communication efficiently
- **Content Script Injection**: Safely adds enhancement icons to websites
- **Chrome Storage API**: Secure storage for user preferences and API keys
- **Error Handling**: Comprehensive error management with user-friendly messages
- **Performance Optimized**: Minimal impact on website loading and browser performance

### Debugging
- **Background script logs**: Access via Chrome's extension developer tools
  - Go to `chrome://extensions/`
  - Find Message Enhancer
  - Click "Service Worker" under "Inspect views"
- **Popup logs**: Right-click the extension popup and select "Inspect"
- **Content script logs**: Open browser DevTools on any website and check the Console tab

## Requirements

- Google Chrome browser (version 88+)
- OpenAI API key with access to GPT-4.1 Nano model
- Node.js and npm (for development only)

## Version History

### v2.0.0 (Current)
- Enhancement text icon (✨) now appear directly in text inputs across websites like Teams, Slack, Gmail and others

### v1.1.0
- Updated to GPT-4.1 Nano model
- Improved text persistence features
- Enhanced user interface

### v1.0.0
- Initial release with core message enhancement features
- Theme support and basic UI

## License

MIT License - See LICENSE file for details

## Keywords

Chrome extension, message enhancer, text improvement, GPT-4.1 Nano, OpenAI, grammar checker, writing assistant, Grammarly alternative, Slack enhancement, Microsoft Teams, Gmail, email enhancement, tone adjustment, text polishing, communication tool, business writing, professional writing, content enhancement, AI writing assistant, text editor, message optimizer, workplace communication, chat enhancement, email formatter, language improvement, writing productivity, text correction, message formatting, content optimization, browser extension, productivity tool, writing tool, communication enhancement, text analysis, automated writing, smart writing, intelligent text processing, workplace productivity, business communication, professional messaging, text refinement, message clarity, writing enhancement, communication optimization