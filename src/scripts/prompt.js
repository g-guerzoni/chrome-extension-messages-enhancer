// Builds the system prompt from src/config/instructions.json. It has no chrome.* calls, so
// tools/compare-models.mjs runs the exact prompt the extension sends.
//
// Labelled sections, with the output rules last so they are the freshest when the model starts writing.
// Only the chosen tone's examples are shown, so the model never sees the two tones side by side.
export function buildSystemMessage(instructions, tone, type, shouldTranslate) {
  const { task, translation, sections, tones, messageTypes, examples, output } = instructions;
  const toneKey = tones[tone] ? tone : "neutral";
  const section = ({ title, rules }) => ["", `${title}:`, ...rules.map((rule) => `- ${rule}`)];
  const example = (item) => `"${item.input}" -> "${item[toneKey]}"`;

  return [
    ...task,
    ...section(shouldTranslate ? translation.enabled : translation.disabled),
    ...sections.flatMap(section),
    ...section(tones[toneKey]),
    ...section(messageTypes[type] ?? messageTypes.message),
    ...section({ title: examples.title, rules: examples.items.map(example) }),
    ...section(output),
  ].join("\n");
}
