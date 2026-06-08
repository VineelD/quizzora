const CODE_BLOCK_PLACEHOLDER = "There is a code example on your screen.";
const INLINE_CODE_PLACEHOLDER = "a short code snippet";

const LATEX_COMMANDS = {
  "\\times": " times ",
  "\\cdot": " times ",
  "\\div": " divided by ",
  "\\pm": " plus or minus ",
  "\\leq": " is less than or equal to ",
  "\\geq": " is greater than or equal to ",
  "\\neq": " does not equal ",
  "\\approx": " is approximately ",
  "\\infty": " infinity ",
  "\\pi": " pi ",
  "\\sqrt": " square root of ",
  "\\frac": " fraction ",
  "\\sum": " the sum of ",
  "\\int": " the integral of ",
  "\\alpha": " alpha ",
  "\\beta": " beta ",
  "\\theta": " theta ",
};

const OFF_TOPIC_PATTERNS = [
  /\boff[- ]topic\b/gi,
  /\bOFF[- ]TOPIC\b/g,
  /\bmockery\b/gi,
  /\bnot\s+on\s+topic\b/gi,
];

function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceCodeFences(text) {
  return String(text || "").replace(/```[\w-]*\n?([\s\S]*?)```/g, () => CODE_BLOCK_PLACEHOLDER);
}

function replaceInlineCode(text) {
  return String(text || "").replace(/`([^`]+)`/g, (_, code) => {
    const trimmed = String(code || "").trim();
    if (!trimmed) {
      return INLINE_CODE_PLACEHOLDER;
    }
    if (trimmed.length <= 24 && /^[\w\s.=+\-*/()]+$/.test(trimmed)) {
      return trimmed.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
    }
    return INLINE_CODE_PLACEHOLDER;
  });
}

function stripMarkdownFormatting(text) {
  let value = String(text || "");
  value = value.replace(/^#{1,6}\s+/gm, "");
  value = value.replace(/\*\*([^*]+)\*\*/g, "$1");
  value = value.replace(/__([^_]+)__/g, "$1");
  value = value.replace(/\*([^*]+)\*/g, "$1");
  value = value.replace(/_([^_]+)_/g, "$1");
  value = value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  value = value.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  value = value.replace(/^>\s?/gm, "");
  value = value.replace(/^[-*+]\s+/gm, "");
  value = value.replace(/^\d+\.\s+/gm, "");
  value = value.replace(/\|/g, " ");
  return value;
}

function convertFractions(text) {
  return String(text || "").replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (_, numerator, denominator) => {
    return `${numerator.trim()} over ${denominator.trim()}`;
  });
}

function convertSupSub(text) {
  let value = String(text || "");
  value = value.replace(/\^\{([^}]+)\}/g, (_, exp) => {
    const trimmed = exp.trim();
    if (trimmed === "2") {
      return " squared";
    }
    if (trimmed === "3") {
      return " cubed";
    }
    return ` to the power of ${trimmed}`;
  });
  value = value.replace(/\^(\d+)/g, (_, exp) => {
    if (exp === "2") {
      return " squared";
    }
    if (exp === "3") {
      return " cubed";
    }
    return ` to the power of ${exp}`;
  });
  value = value.replace(/_\{([^}]+)\}/g, " sub $1 ");
  value = value.replace(/_(\w+)/g, " sub $1 ");
  return value;
}

function convertFactorials(text) {
  return String(text || "").replace(/([A-Za-z0-9]+)!/g, "$1 factorial");
}

function convertLatexDelimiters(text) {
  let value = String(text || "");
  value = value.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => convertLatexMath(math));
  value = value.replace(/\$([^$\n]+)\$/g, (_, math) => convertLatexMath(math));
  value = value.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => convertLatexMath(math));
  value = value.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => convertLatexMath(math));
  return value;
}

function convertLatexMath(math) {
  let value = String(math || "").trim();
  if (!value) {
    return "";
  }

  value = convertFractions(value);
  value = convertSupSub(value);
  value = convertFactorials(value);

  for (const [command, spoken] of Object.entries(LATEX_COMMANDS)) {
    value = value.split(command).join(spoken);
  }

  value = value.replace(/\\left/g, "").replace(/\\right/g, "");
  value = value.replace(/\\[a-zA-Z]+/g, " ");
  value = value.replace(/[{}]/g, " ");
  value = value.replace(/=/g, " equals ");
  value = value.replace(/\+/g, " plus ");
  value = value.replace(/-/g, " minus ");
  value = value.replace(/\*/g, " times ");
  value = value.replace(/\//g, " over ");
  return collapseWhitespace(value);
}

const CONCEPT_HOOK_BREAKS = [
  /\b(Here's how|Let's apply|See this idea|In real life|In practice|Now,|Next,|Finally,|For example,|Consider this)\b/gi,
];

function softenStepTitles(text) {
  return String(text || "")
    .replace(/^Step\s+(\d+)\s*[—–-]\s*/i, (_, step) => `Chapter ${step}. `)
    .replace(/^Frame\s+(\d+)\s+of\s+(\d+)\.?/i, () => "")
    .replace(/^Part\s+(\d+)\s*[—–-]\s*/i, (_, part) => `Part ${part}. `);
}

function addConceptPauses(text) {
  let value = String(text || "");
  for (const pattern of CONCEPT_HOOK_BREAKS) {
    value = value.replace(pattern, (match) => `${match.trim()}... `);
  }
  return value.replace(/—/g, ", ").replace(/–/g, ", ");
}

function removeOffTopicLabels(text) {
  let value = String(text || "");
  for (const pattern of OFF_TOPIC_PATTERNS) {
    value = value.replace(pattern, "");
  }
  return value;
}

function softenRedirectTone(text) {
  return String(text || "")
    .replace(/\blet's keep our study session focused\b/gi, "Let's stay focused on our topic")
    .replace(/\bthat'?s off[- ]topic\b/gi, "Let's bring this back to our topic");
}

export function normalizeTextForSpeech(text, { maxLength = 600 } = {}) {
  let value = String(text || "").trim();
  if (!value) {
    return "";
  }

  value = replaceCodeFences(value);
  value = replaceInlineCode(value);
  value = convertLatexDelimiters(value);
  value = stripMarkdownFormatting(value);
  value = removeOffTopicLabels(value);
  value = softenRedirectTone(value);
  value = softenStepTitles(value);
  value = addConceptPauses(value);
  value = convertFactorials(value);
  value = value.replace(/=/g, " equals ");
  value = collapseWhitespace(value);

  if (maxLength > 0 && value.length > maxLength) {
    const clipped = value.slice(0, maxLength);
    const lastSpace = clipped.lastIndexOf(" ");
    value = (lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped).trim();
  }

  return value;
}

export function buildStepSpeechText(step, { frameIndex = 0, totalFrames = 0 } = {}) {
  if (!step) {
    return "";
  }

  if (step.narrationText?.trim()) {
    return normalizeTextForSpeech(step.narrationText, { maxLength: 600 });
  }

  const parts = [];

  if (totalFrames > 1 && frameIndex > 0) {
    parts.push(`This is part ${frameIndex} of ${totalFrames} in this walkthrough.`);
  }

  if (step.title?.trim()) {
    parts.push(normalizeTextForSpeech(step.title, { maxLength: 120 }));
  }

  if (step.text?.trim()) {
    parts.push(normalizeTextForSpeech(step.text, { maxLength: 480 }));
  }

  for (const callout of step.callouts || []) {
    if (!callout?.label) {
      continue;
    }
    const label = normalizeTextForSpeech(callout.label, { maxLength: 60 });
    const detail = callout.detail ? normalizeTextForSpeech(callout.detail, { maxLength: 120 }) : "";
    parts.push(detail ? `${label}: ${detail}` : label);
  }

  return normalizeTextForSpeech(parts.join(" "), { maxLength: 600 });
}

export function buildPortionSpeechText(portion) {
  if (!portion) {
    return "";
  }

  if (portion.narrationText?.trim()) {
    return normalizeTextForSpeech(portion.narrationText, { maxLength: 320 });
  }

  const parts = [];
  if (portion.label?.trim()) {
    parts.push(normalizeTextForSpeech(portion.label, { maxLength: 100 }));
  }
  if (portion.content?.trim()) {
    parts.push(normalizeTextForSpeech(portion.content, { maxLength: 240 }));
  }

  return normalizeTextForSpeech(parts.join("... "), { maxLength: 320 });
}

export function buildIntroSpeechText(intro, introNarrationText = "") {
  const preferred = String(introNarrationText || "").trim();
  if (preferred) {
    return normalizeTextForSpeech(preferred, { maxLength: 400 });
  }
  return normalizeTextForSpeech(intro, { maxLength: 400 });
}
