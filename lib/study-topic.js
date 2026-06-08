import { shouldRefuseStudentMessage } from "./study-coach.js";

const OFF_TOPIC_PATTERNS = [
  /\b(fortnite|minecraft|roblox|tiktok|instagram|snapchat)\b/i,
  /\b(netflix|disney\+|youtube\s+shorts)\b/i,
  /\b(what\s+time\s+is\s+it|tell\s+me\s+a\s+joke|who\s+won\s+the\s+game)\b/i,
];

const ALWAYS_OFF_TOPIC_PATTERNS = [
  /\bwho\s+should\s+i\s+vote\b/i,
  /\bwhich\s+(party|candidate|politician)\s+should\s+i\s+vote\b/i,
  /\bwhat\s+do\s+you\s+think\s+about\s+(the\s+)?election\b/i,
  /\bwho\s+are\s+you\s+voting\s+for\b/i,
  /\bwho\s+should\s+we\s+vote\b/i,
  /\b(adult|porn|pornography|nsfw|nude|naked)\b/i,
  /\b(how\s+to\s+make\s+a\s+bomb|school\s+shooting)\b/i,
];

const POLITICS_CURRENT_AFFAIRS_PATTERNS = [
  /\b(politics|political|politician|politicians|partisan|partisanship)\b/i,
  /\b(election|elections|referendum|referenda|ballot|candidat\w*)\b/i,
  /\b(vote|voting|voter|voters)\b/i,
  /\b(democrat|republican|liberal\s+party|labor\s+party|greens|coalition)\b/i,
  /\b(prime\s+minister|president|parliament|congress|senate|mp\b|mps\b)\b/i,
  /\b(current\s+affairs|breaking\s+news|headline|headlines)\b/i,
  /\b(trump|biden|morrison|albanese|dutton)\b/i,
];

const RELIGION_DEBATE_PATTERNS = [
  /\b(atheist|atheism|agnostic)\b/i,
  /\b(christianity|islam|judaism|hinduism|buddhism)\b/i,
  /\b(christian|muslim|jewish|hindu|buddhist|catholic|protestant)\b/i,
  /\b(religion|religious|god\s+exists|does\s+god\s+exist)\b/i,
];

const OTHER_SUBJECT_HOMEWORK_PATTERNS = [
  /\b(homework|assignment)\s+(for|in|about)\s+(math|maths|english|history|geography|art|music|pe|sport)\b/i,
  /\bhelp\s+me\s+with\s+my\s+(math|maths|english|history|geography|art|music)\b/i,
];

const STUDY_SIGNAL_PATTERNS = [
  /\bexplain\b/i,
  /\bwhat\s+is\b/i,
  /\bhow\s+does\b/i,
  /\bhelp\s+me\b/i,
  /\bexample\b/i,
  /\bdefine\b/i,
  /\bunderstand\b/i,
  /\bconcept\b/i,
  /\bcompare\b/i,
  /\bdifference\b/i,
  /\bwhy\s+(do|does|is|are)\b/i,
  /\bdescribe\b/i,
  /\bworked\b/i,
  /\bvocabulary\b/i,
  /\bpractice\b/i,
  /\bquiz\b/i,
];

const ASSIGNMENT_CIVICS_TERMS = [
  "government",
  "civics",
  "democracy",
  "democratic",
  "parliament",
  "parliamentary",
  "constitution",
  "constitutional",
  "electoral",
  "referendum",
  "democracy",
  "political system",
  "voting system",
  "house of representatives",
  "senate",
];

function isMessageRelatedToAssignment(context, message) {
  const lowered = String(message || "").toLowerCase();
  const focus = String(context?.focus || "").toLowerCase();
  const subject = String(context?.subject || "").toLowerCase();

  if (focus && lowered.includes(focus)) {
    return true;
  }
  if (subject && lowered.includes(subject)) {
    return true;
  }

  for (const part of focus.split(/[›>]/).map((segment) => segment.trim()).filter(Boolean)) {
    if (part.length > 3 && lowered.includes(part)) {
      return true;
    }
  }

  const scopeText = `${focus} ${subject} ${context?.curriculumSummary || ""}`.toLowerCase();
  const isCivicsScope =
    /\b(civics|government|democracy|parliament|political systems?|elections?|democratic)\b/i.test(scopeText);
  if (isCivicsScope && ASSIGNMENT_CIVICS_TERMS.some((term) => lowered.includes(term))) {
    return true;
  }

  const intentions = Array.isArray(context?.learningIntentions) ? context.learningIntentions : [];
  for (const intention of intentions) {
    const token = String(intention || "")
      .toLowerCase()
      .split(/\s+/)
      .find((word) => word.length > 4);
    if (token && lowered.includes(token)) {
      return true;
    }
  }

  return false;
}

export function shouldForceOffTopic(context, message) {
  const text = String(message || "").trim();
  if (!text || shouldRefuseStudentMessage(text)) {
    return false;
  }

  if (ALWAYS_OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  const sensitivePatterns = [
    ...POLITICS_CURRENT_AFFAIRS_PATTERNS,
    ...RELIGION_DEBATE_PATTERNS,
    ...OTHER_SUBJECT_HOMEWORK_PATTERNS,
  ];

  if (!sensitivePatterns.some((pattern) => pattern.test(text))) {
    return false;
  }

  return !isMessageRelatedToAssignment(context, message);
}

export function isLikelyOnTopicMessage(context, message) {
  const text = String(message || "").trim();
  if (!text || shouldRefuseStudentMessage(text)) {
    return false;
  }
  if (shouldForceOffTopic(context, message)) {
    return false;
  }
  if (OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  const focus = String(context?.focus || "").toLowerCase();
  const subject = String(context?.subject || "").toLowerCase();
  const lowered = text.toLowerCase();

  if (focus && lowered.includes(focus)) {
    return true;
  }
  if (subject && lowered.includes(subject)) {
    return true;
  }

  const intentions = Array.isArray(context?.learningIntentions) ? context.learningIntentions : [];
  for (const intention of intentions) {
    const token = String(intention || "")
      .toLowerCase()
      .split(/\s+/)
      .find((word) => word.length > 4);
    if (token && lowered.includes(token)) {
      return true;
    }
  }

  return STUDY_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

export function buildOffTopicRedirect(context) {
  return `I focus on this assignment's topics — ${context.subject}, ${context.focus}. What would you like to explore: key ideas, vocabulary, or a worked example?`;
}
