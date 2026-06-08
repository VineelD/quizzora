import {
  formatFocusLabel,
  getSubtopicTermsForAssignment,
  getTopicEntries,
  parseFocusLabel,
  topicKey,
} from "./curriculum-topics.js";
import { TOPIC_VOCAB_ML_SIMILARITY_THRESHOLD } from "./speech-refine-config.js";
import { cosineSimilarity, embedSinglePhrase, getVocabEmbeddings } from "./speech-refine-ml.js";
import {
  glossarySeedTermsForTopic,
  masterGlossaryCandidates,
} from "./topic-glossary-seeds.js";

const MIN_SUGGESTIONS = 8;
const MAX_SUGGESTIONS = 20;
const DEFAULT_ASSIGNMENT_PREVIEW = 6;

const topicPhraseEmbeddingCache = new Map();

const TOPIC_STEM_HINTS = [
  {
    stems: ["trigonometry", "trig", "trigonometric", "sohcahtoa", "soh cah toa"],
    topicNames: ["Pythagoras and trigonometry", "Trigonometry and measurement"],
    extras: [
      "SOH CAH TOA",
      "sine",
      "cosine",
      "tangent",
      "hypotenuse",
      "opposite side",
      "adjacent side",
      "angle of elevation",
      "angle of depression",
      "bearings",
      "sine rule",
      "cosine rule",
      "unit circle",
      "radians",
    ],
  },
  {
    stems: ["recursion", "recursive", "recurrence", "fibonacci", "factorial", "permutation"],
    topicNames: ["Recursion and financial modelling"],
    extras: [
      "Fibonacci sequence",
      "recurrence relation",
      "factorial notation",
      "permutations",
      "combinations",
      "compound interest",
      "reducing balance loan",
    ],
  },
  {
    stems: ["quadratic", "parabola", "discriminant"],
    topicNames: ["Quadratic and exponential relationships", "Algebra and calculus introduction"],
    extras: ["quadratic formula", "discriminant", "turning point", "axis of symmetry"],
  },
  {
    stems: ["photosynthesis", "respiration", "mitochondria", "chloroplast"],
    topicNames: ["Cells and biomolecules"],
    extras: ["cellular respiration", "photosynthesis", "ATP", "glucose"],
  },
  {
    stems: ["differentiation", "derivative", "calculus"],
    topicNames: ["Calculus and functions", "Algebra and calculus introduction"],
    extras: ["derivative", "gradient function", "chain rule", "product rule"],
  },
];

function glossaryContextFromRow(row, context = {}, subtopic = null) {
  return {
    ...context,
    topic: row?.topic || context.topic || "",
    focus: context.focus || row?.topic || "",
    subtopic: subtopic || context.subtopic || "",
  };
}

function buildTopicPhrase(topicLabel, seedTerms = [], context = {}) {
  const parts = [
    topicLabel,
    context.subtopic,
    context.topic,
    context.focus,
    ...seedTerms.slice(0, 6),
  ];
  return [...new Set(parts.map((part) => String(part || "").trim()).filter(Boolean))].join(" — ");
}

function seedTermsAlreadyPresent(seedNorms, term) {
  const termNorm = normalizeForMatch(term);
  if (!termNorm) {
    return true;
  }
  for (const seedNorm of seedNorms) {
    if (seedNorm === termNorm || seedNorm.includes(termNorm) || termNorm.includes(seedNorm)) {
      return true;
    }
  }
  return false;
}

/**
 * ML-expand vocabulary for a detected topic using local MiniLM embeddings.
 * @returns {Promise<string[]>}
 */
export async function expandTopicVocabularyWithMl(topicLabel, seedTerms = [], context = {}) {
  const label = String(topicLabel || "").trim();
  if (!label) {
    return [];
  }

  const seeds = uniqueTerms(Array.isArray(seedTerms) ? seedTerms : []);
  const seedNorms = new Set(seeds.map((term) => normalizeForMatch(term)));
  const glossaryContext = { ...context, topic: context.topic || label };
  const candidates = masterGlossaryCandidates(glossaryContext).filter(
    (term) => !seedTermsAlreadyPresent(seedNorms, term),
  );

  if (!candidates.length) {
    return [];
  }

  const phrase = buildTopicPhrase(label, seeds, glossaryContext);
  const cacheKey = normalizeForMatch(`${context.subject || ""}|${context.topicKey || label}|${phrase}`);
  let topicEmbedding = topicPhraseEmbeddingCache.get(cacheKey);
  if (!topicEmbedding) {
    topicEmbedding = await embedSinglePhrase(phrase);
    topicPhraseEmbeddingCache.set(cacheKey, topicEmbedding);
  }

  const { terms, embeddings } = await getVocabEmbeddings(candidates, {
    cacheKey: `topic-glossary:${cacheKey}`,
  });

  const ranked = [];
  for (let index = 0; index < terms.length; index += 1) {
    const score = cosineSimilarity(topicEmbedding, embeddings[index]);
    if (score >= TOPIC_VOCAB_ML_SIMILARITY_THRESHOLD) {
      ranked.push({ term: terms[index], score });
    }
  }

  ranked.sort((left, right) => right.score - left.score);
  return ranked.map((entry) => entry.term);
}

/** Test helper — reset in-memory topic embedding cache. */
export function resetTopicVocabMlCache() {
  topicPhraseEmbeddingCache.clear();
}

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let row = 0; row <= a.length; row += 1) {
    matrix[row][0] = row;
  }
  for (let col = 0; col <= b.length; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
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

function uniqueTerms(terms) {
  const seen = new Set();
  const result = [];
  for (const term of terms) {
    const clean = String(term || "").trim();
    if (!clean) {
      continue;
    }
    const key = normalizeForMatch(clean);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function clampSuggestions(terms) {
  const unique = uniqueTerms(terms);
  if (unique.length <= MAX_SUGGESTIONS) {
    return unique.length >= MIN_SUGGESTIONS ? unique : unique;
  }
  return unique.slice(0, MAX_SUGGESTIONS);
}

function mergeCurriculumAndGlossary(curriculumTerms, glossarySeeds, { glossaryReserve = 6 } = {}) {
  const curriculum = uniqueTerms(curriculumTerms);
  const seeds = uniqueTerms(glossarySeeds);
  const reservedSeedCount = Math.min(seeds.length, glossaryReserve);
  const maxCurriculum = Math.max(MIN_SUGGESTIONS, MAX_SUGGESTIONS - reservedSeedCount);

  const seedNorms = new Set(seeds.map((term) => normalizeForMatch(term)));
  const trimmedCurriculum = curriculum
    .filter((term) => !seedNorms.has(normalizeForMatch(term)))
    .slice(0, maxCurriculum);

  const curriculumNorms = new Set(trimmedCurriculum.map((term) => normalizeForMatch(term)));
  const pickedSeeds = seeds.filter((term) => {
    const norm = normalizeForMatch(term);
    if (!norm || curriculumNorms.has(norm)) {
      return false;
    }
    for (const curriculumNorm of curriculumNorms) {
      if (curriculumNorm.includes(norm) || norm.includes(curriculumNorm)) {
        return false;
      }
    }
    return true;
  });

  return clampSuggestions([...trimmedCurriculum, ...pickedSeeds.slice(0, glossaryReserve)]);
}

function assignmentEntries(context = {}) {
  const { yearLevel, subject, selectedTopicKeys = null, selectedSubtopics = null, focus = "" } = context;
  const entries = getTopicEntries(yearLevel, subject);
  const topicKeys = Array.isArray(selectedTopicKeys) ? selectedTopicKeys.filter(Boolean) : [];
  const subtopicLabels = Array.isArray(selectedSubtopics) ? selectedSubtopics.filter(Boolean) : [];

  if (subtopicLabels.length) {
    const keys = new Set();
    for (const label of subtopicLabels) {
      const parsed = parseFocusLabel(label);
      const key = parsed.stream ? `${parsed.stream} / ${parsed.topic}` : parsed.topic;
      if (key) {
        keys.add(key);
      }
    }
    return entries.filter((row) => keys.has(topicKey(row)));
  }

  if (topicKeys.length) {
    return entries.filter((row) => topicKeys.includes(topicKey(row)));
  }

  const parsed = parseFocusLabel(focus);
  const focusKey = parsed.stream ? `${parsed.stream} / ${parsed.topic}` : parsed.topic;
  const matched = entries.find((row) => topicKey(row) === focusKey);
  return matched ? [matched] : entries;
}

function buildSearchCandidates(context = {}) {
  const candidates = [];
  const entries = assignmentEntries(context);
  const subtopicLabels = Array.isArray(context.selectedSubtopics) ? context.selectedSubtopics.filter(Boolean) : [];

  for (const label of subtopicLabels) {
    const parsed = parseFocusLabel(label);
    const key = parsed.stream ? `${parsed.stream} / ${parsed.topic}` : parsed.topic;
    candidates.push({
      topicKey: key,
      topic: parsed.topic,
      subtopic: parsed.subtopic,
      label: parsed.subtopic || parsed.topic,
      displayLabel: parsed.subtopic || parsed.topic,
      kind: "subtopic",
      searchTerms: [parsed.subtopic, parsed.topic, key, label].filter(Boolean),
    });
  }

  for (const row of entries) {
    const key = topicKey(row);
    candidates.push({
      topicKey: key,
      topic: row.topic,
      subtopic: null,
      label: row.topic,
      displayLabel: row.topic,
      kind: "topic",
      searchTerms: [row.topic, key, row.stream].filter(Boolean),
    });

    for (const subtopic of row.subtopics) {
      candidates.push({
        topicKey: key,
        topic: row.topic,
        subtopic,
        label: subtopic,
        displayLabel: subtopic,
        kind: "subtopic",
        searchTerms: [subtopic, row.topic, key, formatFocusLabel(row, subtopic)],
      });
    }
  }

  return candidates;
}

function textContainsTerm(textNorm, termNorm) {
  if (!textNorm || !termNorm) {
    return false;
  }
  if (termNorm.length < 4) {
    return false;
  }
  if (textNorm.includes(termNorm)) {
    return true;
  }

  const words = textNorm.split(" ").filter(Boolean);
  const termWords = termNorm.split(" ").filter(Boolean);
  if (termWords.length === 1) {
    const threshold = maxEditDistance(termNorm);
    return words.some((word) => {
      if (word.length + 2 < termNorm.length) {
        return false;
      }
      return levenshtein(word, termNorm) <= threshold;
    });
  }

  const threshold = maxEditDistance(termNorm);
  for (let index = 0; index < words.length; index += 1) {
    for (let length = termWords.length; length <= termWords.length + 1 && index + length <= words.length; length += 1) {
      const chunk = words.slice(index, index + length).join(" ");
      if (chunk.length + 2 < termNorm.length) {
        continue;
      }
      if (levenshtein(chunk, termNorm) <= threshold) {
        return true;
      }
    }
  }

  return false;
}

function matchStemHints(textNorm, entries) {
  for (const hint of TOPIC_STEM_HINTS) {
    if (!hint.stems.some((stem) => textContainsTerm(textNorm, normalizeForMatch(stem)))) {
      continue;
    }

    for (const topicName of hint.topicNames) {
      const row = entries.find((entryRow) => entryRow.topic === topicName);
      if (!row) {
        continue;
      }
      return {
        topicKey: topicKey(row),
        topic: row.topic,
        subtopic: null,
        label: row.topic,
        displayLabel: row.topic,
        kind: "topic",
        matchSource: "stem",
      };
    }
  }

  return null;
}

/**
 * Detect a curriculum topic or subtopic mentioned in compose text.
 * @returns {null | { topicKey: string, topic: string, subtopic: string|null, label: string, displayLabel: string, kind: string }}
 */
export function detectTopicMention(text, assignmentContext = {}) {
  const textNorm = normalizeForMatch(text);
  if (!textNorm) {
    return null;
  }

  const entries = assignmentEntries(assignmentContext);
  const candidates = buildSearchCandidates(assignmentContext);
  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    for (const searchTerm of candidate.searchTerms) {
      const termNorm = normalizeForMatch(searchTerm);
      if (!textContainsTerm(textNorm, termNorm)) {
        continue;
      }

      const score = (candidate.kind === "subtopic" ? 100 : 60) + Math.min(termNorm.length, 40);
      if (score > bestScore) {
        best = {
          topicKey: candidate.topicKey,
          topic: candidate.topic,
          subtopic: candidate.subtopic,
          label: candidate.label,
          displayLabel: candidate.displayLabel,
          kind: candidate.kind,
          matchSource: "curriculum",
        };
        bestScore = score;
      }
    }
  }

  if (best) {
    return best;
  }

  return matchStemHints(textNorm, entries);
}

function extrasForTopic(topicName) {
  const hint = TOPIC_STEM_HINTS.find((entry) => entry.topicNames.includes(topicName));
  return hint?.extras || [];
}

function termsForTopicRow(row, { subtopic = null } = {}) {
  if (!row) {
    return [];
  }

  const terms = [row.topic];
  if (row.stream) {
    terms.push(row.stream);
  }

  if (subtopic) {
    terms.push(subtopic);
    for (const sibling of row.subtopics) {
      if (sibling !== subtopic) {
        terms.push(sibling);
      }
    }
  } else {
    terms.push(...row.subtopics);
  }

  terms.push(...extrasForTopic(row.topic));
  return terms;
}

/**
 * Return 8–20 vocabulary suggestions for a topic key, label, or full assignment.
 */
export function getVocabularyForTopic(topicKeyOrLabel, context = {}, options = {}) {
  const { subtopic = null, learningIntentions = [], curriculumSummary = "" } = {
    learningIntentions: context.learningIntentions || [],
    curriculumSummary: context.curriculumSummary || "",
    ...options,
  };

  const entries = assignmentEntries(context);
  const assignmentTerms = getSubtopicTermsForAssignment({
    yearLevel: context.yearLevel,
    subject: context.subject,
    focus: context.focus,
    selectedTopicKeys: context.selectedTopicKeys,
    selectedSubtopics: context.selectedSubtopics,
  });

  if (!topicKeyOrLabel) {
    const terms = [...assignmentTerms];

    for (const row of entries) {
      terms.push(...termsForTopicRow(row));
    }

    terms.push(
      ...learningIntentions,
      ...String(curriculumSummary || "")
        .split(/[.;]/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 4),
    );
    return clampSuggestions(terms);
  }

  const lookup = String(topicKeyOrLabel || "").trim();
  let row =
    entries.find((entryRow) => topicKey(entryRow) === lookup) ||
    entries.find((entryRow) => entryRow.topic === lookup) ||
    null;

  if (!row) {
    const parsed = parseFocusLabel(lookup);
    const key = parsed.stream ? `${parsed.stream} / ${parsed.topic}` : parsed.topic;
    row = entries.find((entryRow) => topicKey(entryRow) === key) || null;
  }

  const focusedSubtopic = subtopic || parseFocusLabel(lookup).subtopic || null;
  const terms = row
    ? termsForTopicRow(row, { subtopic: focusedSubtopic })
    : assignmentTerms.filter((term) => normalizeForMatch(term).includes(normalizeForMatch(lookup)));

  for (const intention of learningIntentions) {
    if (normalizeForMatch(intention).includes(normalizeForMatch(lookup)) || normalizeForMatch(intention).length >= 8) {
      terms.push(intention);
    }
  }

  if (curriculumSummary) {
    terms.push(curriculumSummary);
  }

  const glossaryLabel = row?.topic || lookup;
  const glossarySeeds = glossarySeedTermsForTopic(
    glossaryLabel,
    glossaryContextFromRow(row, context, focusedSubtopic),
  );
  const clamped = mergeCurriculumAndGlossary(terms, glossarySeeds);
  if (clamped.length >= MIN_SUGGESTIONS) {
    return clamped;
  }

  return clampSuggestions([...clamped, ...assignmentTerms]);
}

/**
 * Compose-time suggestion payload for Study Coach chips (curriculum + glossary seeds).
 */
export function getComposeVocabularySuggestions(text, assignmentContext = {}) {
  const mention = detectTopicMention(text, assignmentContext);

  if (mention) {
    return {
      mode: "topic",
      label: mention.displayLabel,
      terms: getVocabularyForTopic(mention.topicKey, assignmentContext, { subtopic: mention.subtopic }),
      mention,
    };
  }

  const terms = getVocabularyForTopic(null, assignmentContext);
  return {
    mode: "assignment",
    label: "Assignment vocabulary",
    terms,
    mention: null,
    previewCount: DEFAULT_ASSIGNMENT_PREVIEW,
  };
}

/**
 * Merge curriculum, glossary seeds, and ML-ranked terms for topic chips.
 */
export async function getComposeVocabularySuggestionsExpanded(text, assignmentContext = {}) {
  const base = getComposeVocabularySuggestions(text, assignmentContext);

  if (base.mode !== "topic") {
    return { ...base, mlExpanded: false };
  }

  const mlTerms = await expandTopicVocabularyWithMl(
    base.mention?.topic || base.label,
    base.terms,
    {
      ...assignmentContext,
      topicKey: base.mention?.topicKey,
      subtopic: base.mention?.subtopic,
      topic: base.mention?.topic,
    },
  );

  return {
    ...base,
    terms: mergeCurriculumAndGlossary(base.terms, mlTerms),
    mlExpanded: true,
  };
}
