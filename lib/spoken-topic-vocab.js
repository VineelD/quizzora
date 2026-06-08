import { getSubtopicTermsForAssignment, parseFocusLabel } from "./curriculum-topics.js";
import { normalizeSpokenMath } from "./spoken-math.js";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "about",
  "your",
  "will",
  "into",
  "are",
  "you",
  "can",
  "how",
  "what",
  "when",
  "where",
  "why",
]);

/** Common Web Speech mishearings for curriculum terms (applied before fuzzy match). */
const STATIC_ALIASES = [
  [/\bre\s+curse(?:ion|s)?\b/gi, "recursion"],
  [/\bfiber\s+naughty\b/gi, "Fibonacci"],
  [/\bfib\s+naughty\b/gi, "Fibonacci"],
  [/\bfibonacci\s+sequence\b/gi, "Fibonacci sequence"],
  [/\bphoto\s+synthesis\b/gi, "photosynthesis"],
  [/\bdiscrim\s+inant\b/gi, "discriminant"],
  [/\bso\s+cah\s+toa\b/gi, "SOH CAH TOA"],
  [/\bsohcahtoa\b/gi, "SOH CAH TOA"],
  [/\bpie\s+thag(?:or(?:as|ian)?|orean)\b/gi, "Pythagoras"],
  [/\bpi\s+thag(?:or(?:as|ian)?|orean)\b/gi, "Pythagoras"],
  [/\bquadratic\s+formula\b/gi, "quadratic formula"],
  [/\bcell\s+ular\s+respiration\b/gi, "cellular respiration"],
  [/\bmito\s+chondria\b/gi, "mitochondria"],
  [/\belectro\s+magnetic\b/gi, "electromagnetic"],
  [/\btrigon(?:ometry|metric)\s+identit(?:y|ies)\b/gi, "trigonometric identities"],
];

function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function preserveCase(original, canonical) {
  const source = String(original || "");
  const target = String(canonical || "");
  if (!source || !target) {
    return target;
  }
  if (source === source.toUpperCase()) {
    return target.toUpperCase();
  }
  if (source[0] === source[0]?.toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

function levenshtein(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) {
    return 0;
  }
  if (!left.length) {
    return right.length;
  }
  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }
  for (let col = 0; col <= right.length; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
}

function maxEditDistance(term) {
  const length = term.length;
  if (length <= 6) {
    return 1;
  }
  if (length <= 12) {
    return 2;
  }
  return 3;
}

function extractPhrases(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return [];
  }

  const phrases = [];
  if (cleaned.length >= 4 && cleaned.length <= 80) {
    phrases.push(cleaned);
  }

  for (const part of cleaned.split(/[.;]/)) {
    const trimmed = part.trim();
    if (trimmed.length >= 4 && trimmed.length <= 60) {
      phrases.push(trimmed);
    }
  }

  return phrases;
}

function filterVocabTerms(terms) {
  return [...new Set(terms.map((term) => String(term || "").trim()).filter(Boolean))]
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term.toLowerCase()))
    .sort((a, b) => b.length - a.length);
}

function buildAliasPatterns(vocab) {
  const patterns = STATIC_ALIASES.map(([pattern, replacement]) => [pattern, replacement]);

  for (const term of vocab) {
    const words = term.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const flexPattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
      patterns.push([new RegExp(`\\b${flexPattern}\\b`, "gi"), term]);
    }
  }

  return patterns;
}

function applyAliasPatterns(text, patterns, corrections) {
  let value = text;

  for (const [pattern, replacement] of patterns) {
    value = value.replace(pattern, (match) => {
      if (normalizeForCompare(match) !== normalizeForCompare(replacement)) {
        corrections.push({ heard: match, corrected: replacement });
      }
      return preserveCase(match, replacement);
    });
  }

  return value;
}

function applyFuzzyVocab(text, vocab, corrections) {
  let words = text.split(/\s+/).filter(Boolean);

  for (const term of vocab) {
    const termNorm = normalizeForCompare(term);
    if (termNorm.length < 4) {
      continue;
    }

    const targetWords = termNorm.split(" ").filter(Boolean);
    const minLen = Math.max(1, targetWords.length - 1);
    const maxLen = targetWords.length + 1;
    const threshold = maxEditDistance(termNorm);

    for (let index = 0; index < words.length; index += 1) {
      for (let length = minLen; length <= maxLen && index + length <= words.length; length += 1) {
        const chunk = words.slice(index, index + length).join(" ");
        const chunkNorm = normalizeForCompare(chunk);
        if (!chunkNorm || chunkNorm === termNorm) {
          continue;
        }

        const distance = levenshtein(chunkNorm, termNorm);
        if (distance > threshold || chunkNorm.length + 2 < termNorm.length) {
          continue;
        }

        const replacement = preserveCase(chunk, term);
        corrections.push({ heard: chunk, corrected: term });
        words.splice(index, length, ...replacement.split(/\s+/));
        index = Math.max(-1, index - 1);
        break;
      }
    }
  }

  return words.join(" ");
}

function applyTopicVocabulary(text, vocab) {
  const corrections = [];
  const patterns = buildAliasPatterns(vocab);
  let value = applyAliasPatterns(text, patterns, corrections);
  value = applyFuzzyVocab(value, vocab, corrections);
  return { text: collapseWhitespace(value), corrections };
}

/**
 * Build speech vocabulary from assignment context and curriculum metadata.
 */
export function buildTopicVocabulary(context = {}) {
  const {
    focus,
    subject,
    yearLevel,
    curriculumSummary = "",
    learningIntentions = [],
    selectedTopicKeys = null,
    selectedSubtopics = null,
    sessionKeyIdeas = [],
  } = context;

  const terms = new Set(
    getSubtopicTermsForAssignment({
      yearLevel,
      subject,
      focus,
      selectedTopicKeys,
      selectedSubtopics,
    }),
  );

  const parsed = parseFocusLabel(focus);
  if (parsed.label) {
    terms.add(parsed.label);
  }

  for (const intention of learningIntentions) {
    for (const phrase of extractPhrases(intention)) {
      terms.add(phrase);
    }
  }

  for (const idea of sessionKeyIdeas) {
    for (const phrase of extractPhrases(idea)) {
      terms.add(phrase);
    }
  }

  for (const phrase of extractPhrases(curriculumSummary)) {
    terms.add(phrase);
  }

  return filterVocabTerms([...terms]);
}

/**
 * Post-process a final Web Speech transcript with topic vocabulary and optional math mode.
 */
export function normalizeSpokenTranscript(text, { mathMode = false, topicVocab = [] } = {}) {
  let value = collapseWhitespace(text);
  if (!value) {
    return { text: "", corrections: [] };
  }

  let corrections = [];
  if (topicVocab?.length) {
    const topicResult = applyTopicVocabulary(value, topicVocab);
    value = topicResult.text;
    corrections = topicResult.corrections;
  }

  if (mathMode) {
    value = normalizeSpokenMath(value);
  }

  return { text: value, corrections };
}

export { normalizeSpokenMath };
