/**
 * Generate Australian curriculum learning guides for subtopics (Study Coach RAG).
 *
 *   node scripts/generate-curriculum-docs.mjs --pilot --limit 3 --force-regenerate
 *   node scripts/generate-curriculum-docs.mjs --pilot-math
 *   node scripts/generate-curriculum-docs.mjs --focus "Trigonometry and measurement — Sine and cosine rules"
 *   node scripts/generate-curriculum-docs.mjs --force-regenerate --focus "Electricity and electromagnetism — Ohm's law and circuits"
 *   node scripts/generate-curriculum-docs.mjs --enrich --force-regenerate
 *   node scripts/generate-curriculum-docs.mjs --enrich --years 7,8,9,10,11,12 --rate-ms 2500
 *   node scripts/generate-curriculum-docs.mjs --limit 5
 *   node scripts/generate-curriculum-docs.mjs --rate-ms 2500
 */
import { enumerateCurriculumCells } from "../lib/question-bank-cells.js";
import {
  generateAndStoreCurriculumDoc,
  getCurriculumDocJob,
  upsertCurriculumDocJob,
} from "../lib/curriculum-doc-generator.js";
import { getCurriculumDocStatusPayload } from "../lib/curriculum-doc-status.js";
import { getDb } from "../lib/db.js";

const PILOT_MATH_FOCUS_SUFFIXES = [
  "Trigonometry and measurement — Sine and cosine rules",
  "Financial planning — Compound interest formulas",
  "Electricity and electromagnetism — Ohm's law and circuits",
];

const DEFAULT_ENRICH_YEARS = ["7", "8", "9", "10", "11", "12"];

function parseArgs(argv) {
  const options = {
    pilot: false,
    pilotMath: false,
    enrich: false,
    forceRegenerate: false,
    focusLabels: [],
    years: [],
    limit: null,
    rateMs: 2000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--pilot") {
      options.pilot = true;
    } else if (arg === "--pilot-math") {
      options.pilotMath = true;
    } else if (arg === "--enrich") {
      options.enrich = true;
      options.forceRegenerate = true;
    } else if (arg === "--force-regenerate") {
      options.forceRegenerate = true;
    } else if (arg === "--focus") {
      options.focusLabels.push(String(argv[index + 1] || "").trim());
      index += 1;
    } else if (arg === "--years") {
      options.years = String(argv[index + 1] || "")
        .split(/[,\s]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
    } else if (arg === "--limit") {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--rate-ms") {
      options.rateMs = Number(argv[index + 1]);
      index += 1;
    }
  }

  if (options.enrich && options.years.length === 0) {
    options.years = [...DEFAULT_ENRICH_YEARS];
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cellMatchesFocus(cell, focusLabels) {
  if (!focusLabels.length) {
    return true;
  }
  return focusLabels.some(
    (focus) => cell.focusLabel === focus || cell.focusLabel.endsWith(` — ${focus}`) || cell.subtopic === focus,
  );
}

function cellMatchesYear(cell, years) {
  if (!years.length) {
    return true;
  }
  const match = String(cell.yearLevel || "").match(/\d+/);
  const yearNumber = match ? match[0] : "";
  return years.includes(yearNumber);
}

function selectCells({ pilot, pilotMath, enrich, forceRegenerate, focusLabels, years, limit }) {
  let cells = enumerateCurriculumCells();

  if (pilotMath) {
    cells = cells.filter((cell) => PILOT_MATH_FOCUS_SUFFIXES.includes(cell.focusLabel));
  } else if (pilot) {
    cells = cells.filter((cell) => cell.yearLevel === "Year 7" && cell.subject === "Science");
  }

  if (years.length) {
    cells = cells.filter((cell) => cellMatchesYear(cell, years));
  }

  if (focusLabels.length) {
    cells = cells.filter((cell) => cellMatchesFocus(cell, focusLabels));
  }

  const pending = cells.filter((cell) => {
    if (forceRegenerate) {
      return true;
    }
    const job = getCurriculumDocJob(cell.focusLabel);
    return !job || job.status === "pending" || job.status === "failed";
  });

  if (Number.isFinite(limit) && limit > 0) {
    return pending.slice(0, limit);
  }
  return pending;
}

const options = parseArgs(process.argv.slice(2));

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error("OPENAI_API_KEY is missing.");
  process.exit(1);
}

getDb();

const cells = selectCells(options);
const modeLabel = options.pilotMath
  ? " (math/science LaTeX pilot)"
  : options.pilot
    ? " (Year 7 Science pilot)"
    : options.enrich
      ? ` (enriched Years ${options.years.join(", ") || "7-12"})`
      : options.focusLabels.length
        ? ` (${options.focusLabels.length} focus filter(s))`
        : "";

console.log(
  `Generating curriculum learning guides for ${cells.length} subtopic(s)${modeLabel}` +
    (options.forceRegenerate ? " [force regenerate]" : "") +
    (options.enrich ? " [enriched depth]" : "") +
    ".",
);

for (const cell of cells) {
  upsertCurriculumDocJob(cell, { status: "pending" });
}

let generated = 0;
let failed = 0;
let validationWarnings = 0;

for (const cell of cells) {
  const result = await generateAndStoreCurriculumDoc(cell, { enriched: options.enrich });
  if (result.ok) {
    generated += 1;
    const warnSuffix =
      result.validationWarnings?.length > 0
        ? ` WARN: ${result.validationWarnings.join("; ")}`
        : "";
    if (result.validationWarnings?.length > 0) {
      validationWarnings += 1;
    }
    console.log(
      `OK  ${cell.focusLabel} (${result.chunkCount} chunks, ${result.wordCount} words)${warnSuffix}`,
    );
  } else {
    failed += 1;
    console.error(`FAIL ${cell.focusLabel}: ${result.error}`);
  }

  if (options.rateMs > 0) {
    await sleep(options.rateMs);
  }
}

console.log(
  JSON.stringify({ generated, failed, validationWarnings, status: getCurriculumDocStatusPayload() }, null, 2),
);
