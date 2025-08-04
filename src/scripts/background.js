const OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4.1-nano-2025-04-14";

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
        temperature: 1,
        max_completion_tokens: 1000,
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
  let textLanguage = "Keep the text in its original language.";

  if (shouldTranslate) {
    textLanguage =
      "Translate the text to English while preserving its original meaning. Make it readable and understandable for a non native English audience.";
  }

  const instructions = {
    base: ["You are a professional text enhancer. Your task is to improve the given text by:"],
    core: [
      "Enhancing clarity and readability",
      "Fixing grammar, punctuation, and other errors",
      "Maintaining the original meaning and intent",
      "If the original text is good enough, just fix typos and return as it is",
      "Do not introduce advice, recommendations, or implied intent not present in the original text",
      "Do not rephrase statements as directives, suggestions, or conclusions unless those were present in the original",
      "When referencing external sources, report exactly what is stated without summarizing as advice or a rule, unless explicitly stated as such in the original",
      "Preserve both the explicit and implicit meaning, avoiding reinterpretation or additional assumptions",
      "Preserve the original implied speaker and the specificity of the audience.",
      "If the text addresses 'you' (singular, e.g., asking a question directly to one person, or a statement to one person), the enhanced version must maintain this singular address. Do not change 'you' to 'anyone,' 'everyone,' or introduce collective pronouns like 'we' or 'us' that broaden the audience, unless the original 'you' clearly implied a group or the context was already collective.",
      "If the original text is an impersonal statement or directive (not addressed to a specific 'you' or anyone in particular), maintain that impersonal stance. Avoid introducing a conversational partner or phrases like 'Let\\'s' unless the original text suggested a collaborative action.`",
    ],
    formatting: [
      "If the original text does not include a greeting (like 'hey there', 'hi', 'hello') or phrases like 'just a heads up', DO NOT add one",
      "Preserve the original level of brevity and formality",
      "Avoid adding greetings or context that weren't originally present",
    ],
    avoidance: [
      "Avoid emojis, hashtags, and other non-textual elements",
      "Avoid excessive wordiness",
      "Avoid americanisms, slang, abbreviations, and acronyms",
      "Avoid idioms, metaphors, similes, hyperboles, and expressions",
      "Do not convert existing acronyms to full words",
      "Do not use 'Just a heads up', 'Just to clarify' or similar phrases, unless the original text includes them",
    ],
    translation: [textLanguage],
    tones: {
      neutral: [
        "Keep the tone casual and natural - like how a regular person would actually speak.",
        "DO NOT replace simple words with fancy synonyms. Keep the original vocabulary level.",
        "Examples of what NOT to do: 'About' → 'Regarding', 'push back' → 'postpone', 'not comfortable' → 'uneasy', 'critical' → 'crucial'.",
        "Keep the original sentence structure when possible. Don't make it sound overly polished or formal.",
        "Use straightforward, everyday language. Avoid words that sound like you're trying to impress someone.",
        "If the original uses contractions, keep them. If it uses simple words, keep them simple.",
        "The goal is to sound natural and authentic, not sophisticated or academic.",
        "IMPORTANT: If the original text is an impersonal statement (e.g., a description, a feature list, a general statement of fact) and not a direct communication to someone, maintain this impersonal nature. In such cases, do not introduce phrases like 'Let\\'s', 'we should', or directly address a 'you' unless the original text already implies such an address.",
      ],
      formal: [
        "Make the tone professional and business-appropriate.",
        "Use complete sentences and avoid contractions (don't → do not, can't → cannot).",
        "Choose more professional vocabulary when appropriate, but avoid overly complex words that sound pretentious.",
        "Structure sentences clearly and professionally.",
        "Remove casual phrases like 'kinda', 'sorta', 'yeah', but keep the message natural.",
        "Use courteous language appropriate for workplace communication.",
        "Examples of appropriate upgrades: 'push back' → 'postpone', 'not sure' → 'uncertain', 'check out' → 'review'.",
        "Maintain clarity - don't sacrifice understanding for formality.",
      ],
    },
    messageTypes: {
      email: [
        "This is an email message. Ensure it follows proper email etiquette and structure while maintaining appropriate tone.",
      ],
      message: ["This is a text meant to be paste in group chats, 1 on 1 chats, social media, kanban boards, sheets, etc."],
    },
    final: ["Provide only the enhanced text without any explanations or additional comments."],
  };

  const messageComponents = [
    ...instructions.base,
    ...instructions.core.map((item) => `- ${item}`),
    ...instructions.formatting.map((item) => `- ${item}`),
    ...instructions.avoidance.map((item) => `- ${item}`),
    ...instructions.translation.map((item) => `- ${item}`),
    ...(instructions.tones[tone] || instructions.tones.neutral).map((item) => `- ${item}`),
    ...instructions.messageTypes[type === "email" ? "email" : "message"],
    ...instructions.final,
  ];

  return messageComponents.join("\n");
}
