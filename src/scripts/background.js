const OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhanceText") {
    enhanceText(request.data)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});

async function enhanceText({ text, tone, translate, type }) {
  const { openaiApiKey } = await chrome.storage.sync.get(["openaiApiKey"]);

  if (!openaiApiKey) {
    throw new Error("OpenAI API key not found. Please set it in the extension settings.");
  }

  const systemMessage = constructSystemMessage(tone, type, translate);

  try {
    const response = await fetch(OPENAI_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
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
        temperature: 0.7,
        max_tokens: 1000,
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
  let textLanguage = "Keep the text in its original language. Improve readability and clarity for speakers of that language.";

  if (shouldTranslate) {
    textLanguage = "Translate the text to English while preserving its original meaning. Make it readable and understandable for an English audience.";
  }

  const instructions = {
    base: ["You are a professional message enhancer. Your task is to improve the given text by:"],
    core: [
      "Enhancing clarity and readability",
      "Fixing grammar, punctuation, and other errors",
      "Maintaining the original meaning and intent",
      "If the original text is good enough, just fix typos and return as it is",
      "Do not introduce advice, recommendations, or implied intent not present in the original text",
      "Do not rephrase statements as directives, suggestions, or conclusions unless those were present in the original",
      "When referencing external sources, report exactly what is stated without summarizing as advice or a rule, unless explicitly stated as such in the original",
      "Preserve both the explicit and implicit meaning, avoiding reinterpretation or additional assumptions"
    ],
    formatting: [
      "If the original text DOES NOT include a greeting (like 'hey there', 'hi', 'hello') or phrases like 'just a heads up', DO NOT add one",
      "Preserve the original level of brevity and formality",
      "Avoid adding greetings or context that weren't originally present"
    ],
    avoidance: [
      "Avoid emojis, hashtags, and other non-textual elements",
      "Avoid excessive wordiness",
      "Avoid americanisms, slang, abbreviations, and acronyms",
      "Avoid idioms, metaphors, similes, hyperboles, and expressions",
      "Do not convert existing acronyms to full words",
      "Do not use 'Just a heads up', 'Just to clarify' or similar phrases, unless the original text includes them"
    ],
    translation: [textLanguage],
    tones: {
      neutral: [
        "Make the tone casual and friendly",
        "Use conversational language and common expressions",
        "Be informal"
      ],
      formal: [
        "Keep the tone professional and respectful",
        "Use more precise language and clearer structure",
        "Maintain appropriate formality",
        "Avoid contractions and casual phrases"
      ],
    },
    messageTypes: {
      email: ["This is an email message. Ensure it follows proper email etiquette and structure while maintaining appropriate tone."],
      message: ["This is a text meant to be sent in group chats, social media, kanban boards, etc. Format it appropriately for this context."]
    },
    final: ["Provide ONLY the enhanced text without any explanations or additional comments."]
  };

  const messageComponents = [
    ...instructions.base,
    ...instructions.core.map(item => `- ${item}`),
    ...instructions.formatting.map(item => `- ${item}`),
    ...instructions.avoidance.map(item => `- ${item}`),
    ...instructions.translation.map(item => `- ${item}`),
    ...(instructions.tones[tone] || instructions.tones.neutral).map(item => `- ${item}`),
    ...instructions.messageTypes[type === "email" ? "email" : "message"],
    ...instructions.final
  ];

  return messageComponents.join("\n");
}
