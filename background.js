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

async function detectLanguage(text, apiKey) {
  try {
    const response = await fetch(OPENAI_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              'You are a language detector. Respond with only the ISO language code: "en" for English, "pt" for Portuguese, etc.',
          },
          {
            role: "user",
            content: `Detect the language of this text: "${text}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to detect language");
    }

    const data = await response.json();
    return data.choices[0].message.content.trim().toLowerCase();
  } catch (error) {
    console.error("Language detection error:", error);
    return "en";
  }
}

async function enhanceText({ text, tone, type }) {
  const { openaiApiKey } = await chrome.storage.sync.get(["openaiApiKey"]);

  if (!openaiApiKey) {
    throw new Error("OpenAI API key not found. Please set it in the extension settings.");
  }

  const language = await detectLanguage(text, openaiApiKey);

  const systemMessage = constructSystemMessage(tone, type, language);

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

function constructSystemMessage(tone, type, language) {
  const messages = {
    en: {
      base: "You are a professional message enhancer. Your task is to improve the given text by:",
      clarity: "\n1. Enhancing clarity and readability",
      grammar: "\n2. Fixing grammar and punctuation",
      meaning: "\n3. Maintaining the original meaning",
      tones: {
        "very-informal": [
          "\n4. Making the tone very casual and friendly",
          "\n5. Using conversational language and common expressions",
        ],
        informal: ["\n4. Keeping a relaxed but professional tone", "\n5. Using friendly but appropriate language"],
        neutral: ["\n4. Maintaining a balanced and professional tone", "\n5. Using clear and straightforward language"],
        formal: [
          "\n4. Using formal and professional language",
          "\n5. Maintaining a respectful and business-appropriate tone",
        ],
      },
      email: {
        base: "\n\nThis is an email message. Ensure it follows proper email etiquette and structure.",
        formal:
          " While maintaining the requested tone, add a slight level of formality appropriate for email communication.",
      },
      final: "\n\nProvide only the enhanced text without any explanations or additional comments.",
    },
    pt: {
      base: "Você é um aprimorador profissional de mensagens. Sua tarefa é melhorar o texto fornecido:",
      clarity: "\n1. Melhorando a clareza e legibilidade",
      grammar: "\n2. Corrigindo gramática e pontuação",
      meaning: "\n3. Mantendo o significado original",
      tones: {
        "very-informal": [
          "\n4. Tornando o tom bem casual e amigável",
          "\n5. Usando linguagem coloquial e expressões comuns",
        ],
        informal: [
          "\n4. Mantendo um tom descontraído mas profissional",
          "\n5. Usando linguagem amigável mas apropriada",
        ],
        neutral: ["\n4. Mantendo um tom equilibrado e profissional", "\n5. Usando linguagem clara e direta"],
        formal: [
          "\n4. Usando linguagem formal e profissional",
          "\n5. Mantendo um tom respeitoso e apropriado para negócios",
        ],
      },
      email: {
        base: "\n\nEste é um email. Certifique-se de seguir a etiqueta e estrutura apropriada para emails.",
        formal: " Mantendo o tom solicitado, adicione um nível de formalidade apropriado para comunicação por email.",
      },
      final: "\n\nForneça apenas o texto aprimorado sem explicações ou comentários adicionais.",
    },
  };

  const langMessages = messages[language] || messages.en;
  let message = langMessages.base;
  message += langMessages.clarity;
  message += langMessages.grammar;
  message += langMessages.meaning;

  const toneInstructions = langMessages.tones[tone];
  if (toneInstructions) {
    message += toneInstructions.join("");
  }

  if (type === "email") {
    message += langMessages.email.base;
    if (tone !== "formal") {
      message += langMessages.email.formal;
    }
  }

  message += langMessages.final;
  return message;
}
