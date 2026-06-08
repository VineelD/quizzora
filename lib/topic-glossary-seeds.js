/**
 * Curated domain glossaries for Study Coach vocabulary chips.
 * Terms use plain unicode (e.g. sin²θ) — not LaTeX delimiters.
 */

export const TOPIC_GLOSSARY_DOMAINS = [
  {
    id: "trigonometry",
    stems: [
      "trigonometry",
      "trig",
      "trigonometric",
      "sohcahtoa",
      "soh cah toa",
      "circular function",
      "unit circle",
      "sine rule",
      "cosine rule",
    ],
    topicNames: ["Pythagoras and trigonometry", "Trigonometry and measurement"],
    terms: [
      "theta",
      "θ",
      "α",
      "β",
      "sine",
      "cosine",
      "tangent",
      "sin²θ",
      "cos²θ",
      "tan²θ",
      "hypotenuse",
      "opposite",
      "adjacent",
      "radians",
      "degrees",
      "SOH CAH TOA",
      "unit circle",
      "period",
      "amplitude",
      "phase shift",
      "Pythagoras",
      "sine rule",
      "cosine rule",
      "identity",
      "double angle",
      "angle of elevation",
      "angle of depression",
      "bearings",
      "reference angle",
      "secant",
      "cosecant",
      "cotangent",
    ],
  },
  {
    id: "recursion",
    stems: ["recursion", "recursive", "recurrence", "fibonacci", "factorial", "permutation", "sequence"],
    topicNames: ["Recursion and financial modelling"],
    terms: [
      "Fibonacci",
      "Fibonacci sequence",
      "recurrence relation",
      "base case",
      "recursive step",
      "factorial",
      "n!",
      "permutation",
      "combination",
      "compound interest",
      "reducing balance",
      "annuity",
      "Fₙ",
      "initial term",
      "common ratio",
    ],
  },
  {
    id: "quadratic",
    stems: ["quadratic", "parabola", "discriminant", "polynomial"],
    topicNames: ["Quadratic and exponential relationships", "Algebra and calculus introduction"],
    terms: [
      "quadratic formula",
      "discriminant",
      "Δ",
      "turning point",
      "axis of symmetry",
      "vertex",
      "roots",
      "factorisation",
      "completing the square",
      "parabola",
      "x-intercept",
      "y-intercept",
    ],
  },
  {
    id: "calculus",
    stems: ["differentiation", "derivative", "calculus", "integration", "integral"],
    topicNames: ["Calculus and functions", "Algebra and calculus introduction"],
    terms: [
      "derivative",
      "gradient function",
      "dy/dx",
      "chain rule",
      "product rule",
      "quotient rule",
      "integration",
      "antiderivative",
      "limit",
      "stationary point",
      "inflection point",
      "tangent line",
    ],
  },
  {
    id: "biology",
    stems: ["photosynthesis", "respiration", "mitochondria", "chloroplast", "cell", "atp"],
    topicNames: ["Cells and biomolecules"],
    terms: [
      "photosynthesis",
      "cellular respiration",
      "ATP",
      "glucose",
      "mitochondria",
      "chloroplast",
      "chlorophyll",
      "cytoplasm",
      "nucleus",
      "membrane",
      "enzyme",
    ],
  },
];

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textContainsStem(textNorm, stemNorm) {
  if (!textNorm || !stemNorm) {
    return false;
  }
  if (stemNorm.length < 3) {
    return false;
  }
  return textNorm.includes(stemNorm);
}

/**
 * Match glossary domain(s) from a topic label and optional curriculum topic name.
 */
export function matchGlossaryDomains(topicLabel, context = {}) {
  const haystack = normalizeForMatch(
    [topicLabel, context.topic, context.focus, context.subject].filter(Boolean).join(" "),
  );
  const matched = [];

  for (const domain of TOPIC_GLOSSARY_DOMAINS) {
    const byStem = domain.stems.some((stem) => textContainsStem(haystack, normalizeForMatch(stem)));
    const byTopicName = domain.topicNames.some((name) => textContainsStem(haystack, normalizeForMatch(name)));
    if (byStem || byTopicName) {
      matched.push(domain);
    }
  }

  return matched;
}

/**
 * Built-in glossary seed terms for a detected topic (no ML).
 */
export function glossarySeedTermsForTopic(topicLabel, context = {}) {
  const domains = matchGlossaryDomains(topicLabel, context);
  const terms = [];
  for (const domain of domains) {
    terms.push(...domain.terms);
  }
  return terms;
}

/**
 * Master candidate pool for ML similarity ranking (deduped).
 */
export function masterGlossaryCandidates(context = {}) {
  const domains = matchGlossaryDomains(context.topic || context.focus || "", context);
  const pool = domains.length
    ? domains.flatMap((domain) => domain.terms)
    : TOPIC_GLOSSARY_DOMAINS.flatMap((domain) => domain.terms);

  return [...new Set(pool.map((term) => String(term || "").trim()).filter(Boolean))];
}
