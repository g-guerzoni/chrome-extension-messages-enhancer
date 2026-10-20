# AI Message Enhancer Chrome Extension

A Chrome extension that enhances, corrects, and beautifies your text using fast, low-cost AI models through OpenRouter (Grok, Gemini, GPT, Claude) or OpenAI directly. Fix typos, improve clarity, adjust tone, and polish your writing for Slack, Teams, email, and any text input across the web.

## Features

### Text Enhancement & Correction
- **Fix typos and spelling errors** automatically
- **Correct grammar and punctuation** mistakes
- **Improve clarity and readability** of your writing
- **Beautify and polish** text while preserving your original meaning
- Bring your own key: OpenRouter (default, Grok 4.1 Fast) or OpenAI
- Responses stream in as they are generated

<img width="509" height="604" alt="image" src="https://github.com/user-attachments/assets/e080ca0a-d7ff-4488-af7c-781c6149b0b5" />

### Website Integration
- **Enhancement icon appears directly in text fields** across websites like Teams, Slack, Gmail, and any web page
- **In-place enhancement**: Click the sparkles ✨ icon and the text in the field is replaced with the enhanced version, with an **Undo** button (Ctrl+Z also works)
- **Selection support**: Select part of the text to enhance only that part
- **Keyboard shortcut**: `Alt+Shift+E` enhances the focused field (change it at `chrome://extensions/shortcuts`)
- **Right-click menu**: "Enhance with AI Message Enhancer" on any editable field
- Uses the tone, message type and translation options last chosen in the popup

<img width="929" height="70" alt="Screenshot 2025-08-04 at 13 20 40" src="https://github.com/user-attachments/assets/f59e7823-a668-4b57-94db-13ea93d0b15d" />

### Settings

<img width="553" height="742" alt="image" src="https://github.com/user-attachments/assets/33a46d48-d109-4b44-a58b-2e60f06a9a7a" />

### Language & Translation
- **Automatic language detection** for any input text
- **Optional translation to English** from the original language
- Preserves original meaning and context during translation
- Works with any input language supported by the selected model

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

2. Load the extension in Chrome (there is no build step):
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" and select the extension directory

3. Configure the extension:
   - Click the extension icon in Chrome's toolbar
   - Click the "Settings" button (gear icon)
   - Pick a model and enter the matching API key (OpenRouter or OpenAI)
   - Select your preferred theme
   - Configure website integration settings
   - Click "Save Settings"

## Usage

### Traditional Method (Extension Popup)
1. Click the extension icon in Chrome's toolbar
2. Enter or paste your text (maximum 10000 characters)
3. Configure your enhancement options:
   - Select tone (Neutral or Formal)
   - Choose message type (Message or Email)
   - Enable translation to English if needed
4. Click "Enhance Message" to correct typos, fix grammar, and beautify your text
5. Review the enhanced, polished text in the output area
6. Click the copy icon to copy the corrected text to your clipboard

### Website Integration Method
1. Navigate to any website with text inputs (Teams, Slack, Gmail, etc.)
2. Type your message in a text field
3. Click the sparkles ✨ icon, press `Alt+Shift+E`, or right-click and choose "Enhance with AI Message Enhancer"
4. The text is enhanced in place (only the selection, if you selected something)
5. Not happy with it? Click **Undo** in the notification or press Ctrl+Z

## Settings

### API Configuration
- **Model**: choose from a short list of fast, low-cost models (see below)
- **Data notice**: shown on install and on upgrade from v2. Nothing is sent to an AI provider until you accept it, and you can withdraw consent at any time in settings
- **API keys**: an OpenRouter key (`sk-or-...`) for the OpenRouter models, or an OpenAI key for the OpenAI models
- API keys and the selected model are stored in Chrome's local storage on this device only (not synced to your Google account)
- Your API key is only sent to the provider of the selected model

### Models

| Model | Provider | Price (input / output per 1M tokens) | Notes |
| --- | --- | --- | --- |
| Grok 4.1 Fast | OpenRouter | $0.20 / $0.50 | Default. Fast, cheapest output, reasoning disabled |
| Gemini 3.1 Flash Lite | OpenRouter | $0.25 / $1.50 | Very low latency |
| GPT-5.4 Nano | OpenRouter | $0.20 / $1.25 | |
| Claude Haiku 4.5 | OpenRouter | $1.00 / $5.00 | Highest quality, higher cost |
| GPT-5 Nano | OpenAI | $0.05 / $0.40 | Minimal reasoning effort |
| GPT-4.1 Nano | OpenAI | $0.10 / $0.40 | |

Prices as listed by the providers when this list was made; check OpenRouter for current prices. Models are configured in `src/config/model.json`.

### User Preferences
- **Theme Selection**: Choose between System, Light, or Dark mode
- **Keep Text on Close**: Automatically save and restore your text between sessions
- **Website Integration**: Enable or disable the ✨ icon on websites
- **Domain Blocking**: Block enhancement icons on specific domains or pages (e.g., `github.com`, `twitter.com/compose`)

### Website Integration
- **Show enhancement icons on websites**: Toggle the sparkles icon that appears in text fields across websites
- **Automatic detection**: Works with textareas, text inputs and rich editors (contenteditable), including Microsoft Teams, Slack and Gmail
- **Performance optimized**: No page polling; the script only reacts when a text field gets focus
- Password, one-time-code and credit card fields are ignored, as are sites whose host looks like banking or login pages

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
│   ├── config/                # Providers, models, prompt instructions and limits
│   ├── interface/
│   │   ├── popup.html         # Main extension interface
│   │   └── options.html       # Settings page
│   ├── scripts/
│   │   ├── popup.js           # Main UI logic and enhancement handling
│   │   ├── options.js         # Settings management
│   │   ├── background.js      # Service worker: streaming API calls, shortcut, context menu
│   │   ├── content.js         # Website integration script (in-place enhancement)
│   │   └── shared.js          # Config/settings helpers shared by the extension pages
│   └── styles/
│       ├── common.css         # Shared styles and theme variables
│       ├── popup.css          # Main interface styles
│       └── options.css        # Settings page styles
├── icons/                     # icon16/32/48/128.png; icon.svg and icon16.svg are their sources
└── docs/                      # Specs, plans and README screenshots (not packaged)
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
  - Find AI Message Enhancer
  - Click "Service Worker" under "Inspect views"
- **Popup logs**: Right-click the extension popup and select "Inspect"
- **Content script logs**: Open browser DevTools on any website and check the Console tab

## Requirements

- Google Chrome browser (version 88+)
- An OpenRouter API key (or an OpenAI API key)

## Version History

### v3.0.0 (Current)
- Added OpenRouter support with a short list of fast, low-cost models; Grok 4.1 Fast is the new default
- Responses stream into the popup as they are generated; reasoning is disabled or minimal for faster answers
- The ✨ icon now enhances the text in place (or only the selection) with Undo, instead of opening the popup
- Added a keyboard shortcut (`Alt+Shift+E`) and a right-click menu entry
- Text replacement goes through the browser's editing pipeline, so rich editors (Slack, Teams, Gmail) keep working and Ctrl+Z undoes it
- API keys and saved text moved from sync storage to local storage (existing settings are migrated automatically)
- Clearer API errors, including empty or truncated responses
- Content script rewritten: no polling, a single shadow-DOM icon, works in iframes, fixed disabled/read-only fields getting an icon
- Removed unused permissions (`activeTab`) and the web-accessible config files

### v2.4.2
- Added version display in settings page header
- Improved content script input validation to exclude more input types (radio, checkbox, file, etc.)
- Enhanced input type filtering to support search, url, and tel inputs

### v2.1.0
- Added domain blocking feature to disable enhancement icons on specific websites
- Fixed content script initialization timing issues
- Fixed missing CSS styles for textarea and checkbox labels in options page
- Improved domain validation and Chrome storage sync integration
- Added debug logging for troubleshooting

### v2.0.0
- Enhancement text icon (✨) now appear directly in text inputs across websites like Teams, Slack, Gmail and others
- Enhanced text input detection with floating icons
- Support for major platforms (Gmail, Slack, Teams, etc.)
- Theme management and settings persistence
- Content script with website integration capabilities

### v1.1.0
- Updated to GPT-4.1 Nano model
- Improved text persistence features
- Enhanced user interface

### v1.0.0
- Initial release with core message enhancement features
- Theme support and basic UI

## Author

Guilherme Guerzoni

## License

MIT License - See LICENSE file for details
