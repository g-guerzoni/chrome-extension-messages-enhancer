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
  const translate = shouldTranslate
    ? "Translating the text to English while preserving its original meaning and intent"
    : "Do not translate the content/text, keep it in its original language";

  const message = {
    base: "You are a professional message enhancer. Your task is to improve the given text by:",
    clarity: "\n1. Enhancing clarity and readability",
    grammar: "\n2. Fixing grammar and punctuation",
    meaning: "\n3. Maintaining the original meaning",
    translate: `\n3. ${translate}`,
    tones: {
      "very-informal": [
        "\n4. Making the tone very casual and friendly",
        "\n5. Using conversational language and common expressions",
        "\n6. Be informal",
      ],
      informal: ["\n4. Keeping a relaxed but professional tone", "\n5. Using friendly but appropriate language", "Don't be formal"],
      neutral: [
        "\n4. Maintaining a balanced and professional tone, but not too formal",
        "\n5. Using clear and straightforward language",
      ],
      formal: [
        "\n4. Using formal and professional language",
        "\n5. Maintaining a respectful and business-appropriate tone",
      ],
    },
    email: {
      base: "\n\nThis is an email message. Ensure it follows proper email etiquette and structure. But keep it informal and friendly.",
    },
    final: "\n\nProvide only the enhanced text without any explanations or additional comments.",
  };

  let messages = message.base;
  messages += message.clarity;
  messages += message.grammar;
  messages += message.meaning;
  messages += message.translate;

  const toneInstructions = message.tones[tone];
  if (toneInstructions) {
    messages += toneInstructions.join("");
  }

  if (type === "email") messages += message.email.base;
  else messages += "This is not an email message, it's a message in a chat/group chat";

  messages += message.final;
  return messages;
}
