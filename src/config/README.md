# Configuration Files

This directory contains externalized configuration for easier maintenance and customization of the Message Enhancer extension.

## Files Overview

### 1. **config.json**
General extension configuration including API endpoints, limits, and defaults.

**Structure:**
```json
{
  "api": {
    "openai": {
      "endpoint": "https://api.openai.com/v1/chat/completions"
    }
  },
  "limits": {
    "maxCharacters": 10000,
    "maxCompletionTokens": 10000,
    "pendingTextTimeout": 10000
  },
  "defaults": {
    "model": "gpt-5-nano-2025-08-07",
    "theme": "system",
    "keepTextOnClose": true,
    "enableContentScript": true,
    "debugMode": false
  },
  "contentScript": {
    "blockedPatterns": [...],
    "iconSettings": {...},
    "teamsBehavior": {...}
  }
}
```

**Usage:**
- API endpoint configuration
- Character and token limits
- Default user preferences
- Content script behavior settings

---

### 2. **model.json**
AI model configurations and specifications.

**Structure:**
```json
{
  "defaultModel": "gpt-5-nano-2025-08-07",
  "models": [
    {
      "id": "gpt-5-nano-2025-08-07",
      "name": "GPT 5 Nano",
      "provider": "OpenAI",
      "max_completion_tokens": 10000,
      "temperature": 1,
      "default": true
    }
  ]
}
```

**Usage:**
- Add new AI models by adding entries to the `models` array
- Configure model-specific parameters (tokens, temperature)
- Set default model via `defaultModel` field

**To Add a New Model:**
1. Add model object to `models` array
2. Include: `id`, `name`, `provider`, `max_completion_tokens`, `temperature`, `default`
3. Update options UI to include new model in dropdown

---

### 3. **instructions.json**
AI prompt instructions for text enhancement.

**Structure:**
```json
{
  "baseTask": {
    "default": "...",
    "withTranslation": "..."
  },
  "core": [...],
  "formatting": [...],
  "avoidance": [...],
  "translation": {
    "enabled": [...],
    "disabled": [...]
  },
  "tones": {
    "neutral": [...],
    "formal": [...]
  },
  "messageTypes": {
    "email": [...],
    "message": [...]
  },
  "final": [...]
}
```

**Usage:**
- Customize AI behavior for text enhancement
- Add new tone options
- Modify enhancement guidelines
- Add new message types

**To Add a New Tone:**
1. Add tone key to `tones` object
2. Provide array of instruction strings
3. Update popup UI to include new tone radio button

**To Add a New Message Type:**
1. Add type key to `messageTypes` object
2. Provide array of instruction strings
3. Update popup UI to include new type radio button

---

### 4. **selectors.json**
DOM selectors for content script integration.

**Structure:**
```json
{
  "general": {
    "textInputs": "...",
    "messageEnhancerIcons": "..."
  },
  "platforms": {
    "teams": {
      "hostname": "teams.microsoft.com",
      "inputs": "..."
    }
  }
}
```

**Usage:**
- Configure which elements content script targets
- Add platform-specific selectors
- Easy maintenance when websites update their HTML

**To Add a New Platform:**
1. Add platform key to `platforms` object
2. Specify `hostname` and `inputs` selector
3. Content script will automatically detect and use it

---

## Benefits of Externalized Configuration

### 1. **Easier Maintenance**
- Update AI instructions without touching code
- Add new models without modifying multiple files
- Change platform selectors when websites update

### 2. **Better Organization**
- Clear separation of config from logic
- Single source of truth for each configuration type
- Easy to review and audit settings

### 3. **Flexibility**
- Easy to test different prompt configurations
- Simple A/B testing of instruction sets
- Quick platform compatibility updates

### 4. **Scalability**
- Add new models without code changes
- Support new platforms with just selector updates
- Extend functionality through configuration

---

## File Locations in Code

### background.js
- Loads: `config.json`, `model.json`, `instructions.json`
- Uses: API endpoint, model configuration, AI instructions
- Function: `loadConfigurations()` fetches all configs at startup

### content.js (Future)
- Will load: `config.json`, `selectors.json`
- Uses: Content script settings, platform selectors
- Not yet implemented (planned improvement)

### options.js (Future)
- Could load: `model.json` to dynamically populate dropdown
- Not yet implemented (planned improvement)

---

## Manifest Integration

Configuration files are declared as web accessible resources:

```json
"web_accessible_resources": [
  {
    "resources": ["src/config/*.json"],
    "matches": ["<all_urls>"]
  }
]
```

This allows the service worker and scripts to load configs via `chrome.runtime.getURL()`.

---

## Best Practices

### When Modifying Configurations

1. **Always validate JSON syntax** before saving
2. **Test changes** in development before deploying
3. **Keep backups** of working configurations
4. **Document** any custom instructions or settings

### Version Control

- Commit configuration changes separately from code
- Use meaningful commit messages for config updates
- Tag releases that include config changes

### Testing

After configuration changes:
1. Reload extension in Chrome
2. Test text enhancement with different tones
3. Verify model selection works correctly
4. Check content script still functions

---

## Future Improvements

Potential enhancements for configuration system:

1. **Dynamic Config Reloading**
   - Hot-reload configs without extension reload
   - Listen for config file changes

2. **Config Validation**
   - JSON schema validation
   - Type checking for all config values

3. **User-Customizable Instructions**
   - Allow users to modify instructions via UI
   - Save custom instruction sets

4. **Platform Auto-Detection**
   - Automatically load platform-specific selectors
   - Fallback to general selectors

5. **Config Import/Export**
   - Allow users to export their configurations
   - Share config presets between users

---

## Troubleshooting

### Extension Not Loading
- Check JSON syntax in all config files
- Verify files are in correct location
- Check browser console for errors

### Instructions Not Working
- Validate `instructions.json` structure
- Check tone/type keys match code references
- Verify no typos in instruction strings

### Model Not Found
- Confirm model ID exists in `model.json`
- Check `defaultModel` value is valid
- Verify model is supported by OpenAI

---

## Contributing

When contributing configuration improvements:

1. Test thoroughly in development
2. Document changes in commit message
3. Update this README if adding new config files
4. Ensure backward compatibility when possible
