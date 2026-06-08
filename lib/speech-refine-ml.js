import {
  SPEECH_REFINE_SIMILARITY_THRESHOLD,
  SPEECH_REFINE_VOCAB_CAP,
  studyCoachSpeechMlModel,
} from "./speech-refine-config.js";

let embedderPromise = null;
let modelLoadStartedAt = 0;
const vocabEmbeddingCache = new Map();

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

export function cosineSimilarity(left, right) {
  const a = left || [];
  const b = right || [];
  if (!a.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (!normA || !normB) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function loadEmbedder() {
  if (!embedderPromise) {
    modelLoadStartedAt = Date.now();
    const modelId = studyCoachSpeechMlModel();
    embedderPromise = import("@xenova/transformers")
      .then(({ pipeline }) => pipeline("feature-extraction", modelId, { quantized: true }))
      .then((pipe) => {
        const loadMs = Date.now() - modelLoadStartedAt;
        console.info(`[speech-refine] loaded embedding model ${modelId} in ${loadMs}ms`);
        return pipe;
      })
      .catch((error) => {
        embedderPromise = null;
        throw error;
      });
  }
  return embedderPromise;
}

export async function embedSinglePhrase(text) {
  const [embedding] = await embedTexts([text]);
  return embedding || [];
}

async function embedTexts(texts) {
  const pipe = await loadEmbedder();
  const inputs = texts.map((text) => collapseWhitespace(text)).filter(Boolean);
  if (!inputs.length) {
    return [];
  }

  const output = await pipe(inputs, { pooling: "mean", normalize: true });
  const rows = output.tolist();
  return Array.isArray(rows[0]) ? rows : [rows];
}

function cacheKeyForVocab(vocab) {
  return vocab.join("\u0001");
}

export async function getVocabEmbeddings(vocab, { cacheKey = null } = {}) {
  const terms = [...new Set(vocab.map((term) => String(term || "").trim()).filter(Boolean))].slice(
    0,
    SPEECH_REFINE_VOCAB_CAP,
  );
  if (!terms.length) {
    return { terms: [], embeddings: [] };
  }

  const key = cacheKey || cacheKeyForVocab(terms);
  const cached = vocabEmbeddingCache.get(key);
  if (cached) {
    return cached;
  }

  const embeddings = await embedTexts(terms);
  const payload = { terms, embeddings };
  vocabEmbeddingCache.set(key, payload);
  return payload;
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

function extractCandidatePhrases(text) {
  const words = collapseWhitespace(text).split(/\s+/).filter(Boolean);
  const candidates = [];

  for (let start = 0; start < words.length; start += 1) {
    for (let length = 1; length <= 4 && start + length <= words.length; length += 1) {
      const phrase = words.slice(start, start + length).join(" ");
      if (phrase.length >= 4) {
        candidates.push({ start, length, phrase });
      }
    }
  }

  return candidates.sort((a, b) => b.length - a.length || b.phrase.length - a.phrase.length);
}

export function findNearestVocabTerm(phraseEmbedding, vocabEmbeddings, vocabTerms) {
  let bestTerm = null;
  let bestScore = 0;

  for (let index = 0; index < vocabTerms.length; index += 1) {
    const score = cosineSimilarity(phraseEmbedding, vocabEmbeddings[index]);
    if (score > bestScore) {
      bestScore = score;
      bestTerm = vocabTerms[index];
    }
  }

  return { term: bestTerm, score: bestScore };
}

/**
 * Default similarity lookup — embed phrase and compare against cached vocab vectors.
 */
export async function defaultFindSimilarTerm(phrase, vocab, options = {}) {
  const { terms, embeddings } = await getVocabEmbeddings(vocab, options);
  if (!terms.length) {
    return { term: null, score: 0 };
  }

  const [phraseEmbedding] = await embedTexts([phrase]);
  return findNearestVocabTerm(phraseEmbedding, embeddings, terms);
}

/**
 * Apply embedding similarity after local spoken-math / topic-vocab rules.
 * `findSimilarTerm` is injectable for unit tests.
 */
export async function applyMlVocabRefinement(text, vocab, options = {}) {
  const {
    findSimilarTerm = defaultFindSimilarTerm,
    similarityThreshold = SPEECH_REFINE_SIMILARITY_THRESHOLD,
    cacheKey = null,
  } = options;

  const cleaned = collapseWhitespace(text);
  if (!cleaned || !vocab?.length) {
    return { text: cleaned, corrections: [] };
  }

  const vocabNorms = new Set(
    vocab.map((term) => normalizeForCompare(term)).filter(Boolean),
  );
  const words = cleaned.split(/\s+/).filter(Boolean);
  const corrections = [];
  const candidates = extractCandidatePhrases(cleaned);

  for (const candidate of candidates) {
    const phraseNorm = normalizeForCompare(candidate.phrase);
    if (!phraseNorm || vocabNorms.has(phraseNorm)) {
      continue;
    }

    const match = await findSimilarTerm(candidate.phrase, vocab, { cacheKey });
    if (!match.term || match.score < similarityThreshold) {
      continue;
    }

    const targetNorm = normalizeForCompare(match.term);
    if (!targetNorm || phraseNorm === targetNorm) {
      continue;
    }

    const replacement = preserveCase(candidate.phrase, match.term);
    corrections.push({
      from: candidate.phrase,
      to: match.term,
      score: Number(match.score.toFixed(4)),
    });

    words.splice(candidate.start, candidate.length, ...replacement.split(/\s+/));
    break;
  }

  return {
    text: collapseWhitespace(words.join(" ")),
    corrections,
  };
}

/** Test helper — reset model + embedding caches. */
export function resetSpeechRefineMlState() {
  embedderPromise = null;
  modelLoadStartedAt = 0;
  vocabEmbeddingCache.clear();
}
