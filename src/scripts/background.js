let CONFIG = null;
let MODELS = null;
let INSTRUCTIONS = null;

async function loadConfigurations() {
  const [config, models, instructions] = await Promise.all([
    fetch(chrome.runtime.getURL("src/config/config.json")).then(r => r.json()),
    fetch(chrome.runtime.getURL("src/config/model.json")).then(r => r.json()),
    fetch(chrome.runtime.getURL("src/config/instructions.json")).then(r => r.json())
  ]);
  CONFIG = config;
  MODELS = models;
  INSTRUCTIONS = instructions;
}

loadConfigurations();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhanceText") {
    enhanceText(request.data)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (request.action === "openPopupWithText") {
    chrome.storage.local.set({
      pendingText: request.text,
      pendingTimestamp: Date.now(),
      autoEnhance: true
    }, () => {
      chrome.action.openPopup().then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        chrome.storage.sync.get(['debugMode'], (result) => {
          if (result.debugMode) {
            console.error("Failed to open popup:", error);
          }
        });
        sendResponse({ success: false, error: error.message });
      });
    });
    return true;
  }
});

async function enhanceText({ text, tone, translate, type }) {
  if (!CONFIG || !MODELS || !INSTRUCTIONS) {
    await loadConfigurations();
  }

  const { openaiApiKey, openaiModel } = await chrome.storage.sync.get(["openaiApiKey", "openaiModel"]);

  if (!openaiApiKey) {
    throw new Error("OpenAI API key not found. Please set it in the extension settings.");
  }

  const modelId = openaiModel || MODELS.defaultModel;
  const modelConfig = MODELS.models.find(m => m.id === modelId);
  const systemMessage = constructSystemMessage(tone, type, translate);

  try {
    const response = await fetch(CONFIG.api.openai.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: "system",
            content: systemMessage,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: modelConfig?.temperature || 1,
        max_completion_tokens: modelConfig?.max_completion_tokens || CONFIG.limits.maxCompletionTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "API request failed");
    }

    const data = await response.json();
    return {
      success: true,
      enhancedText: data.choices[0].message.content.trim(),
    };
  } catch (error) {
    throw new Error(`Failed to enhance text: ${error.message}`);
  }
}

function constructSystemMessage(tone, type, shouldTranslate) {
  const baseTask = shouldTranslate ? INSTRUCTIONS.baseTask.withTranslation : INSTRUCTIONS.baseTask.default;
  const translation = shouldTranslate ? INSTRUCTIONS.translation.enabled : INSTRUCTIONS.translation.disabled;
  const toneInstructions = INSTRUCTIONS.tones[tone] || INSTRUCTIONS.tones.neutral;
  const messageTypeInstructions = INSTRUCTIONS.messageTypes[type === "email" ? "email" : "message"];

  const messageComponents = [
    baseTask,
    ...translation.map((item) => `- ${item}`),
    ...INSTRUCTIONS.core.map((item) => `- ${item}`),
    ...INSTRUCTIONS.formatting.map((item) => `- ${item}`),
    ...INSTRUCTIONS.avoidance.map((item) => `- ${item}`),
    ...toneInstructions.map((item) => `- ${item}`),
    ...messageTypeInstructions,
    ...INSTRUCTIONS.final,
  ];

  return messageComponents.join("\n");
}
