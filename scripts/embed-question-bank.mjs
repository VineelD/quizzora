/**
 * Embed published question-bank items via local Ollama.
 *
 *   node C:\LittleCode\scripts\embed-question-bank.mjs
 *   node C:\LittleCode\scripts\embed-question-bank.mjs --limit 200
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path) {
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator < 1) {
        continue;
      }
      const name = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (!process.env[name]) {
        process.env[name] = value;
      }
    }
  } catch {
    // optional file
  }
}

const root = join(import.meta.dirname, "..");
loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env"));

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limitFlagIndex = process.argv.indexOf("--limit");
const limit =
  limitArg != null
    ? Number(limitArg.split("=")[1])
    : limitFlagIndex >= 0
      ? Number(process.argv[limitFlagIndex + 1])
      : 500;

const { checkOllamaEmbeddingsAvailable } = await import("../lib/ollama-embeddings.js");
const { embedQuestionBankItems, getQuestionEmbeddingStats } = await import("../lib/question-bank-embed.js");

const availability = await checkOllamaEmbeddingsAvailable();
if (!availability.ok) {
  console.error(availability.error || "Ollama embeddings are not available.");
  process.exit(1);
}

const before = getQuestionEmbeddingStats();
console.log(
  `Embedding with ${before.model} — currently ${before.embedded}/${before.published} published items embedded.`,
);

const result = await embedQuestionBankItems({ limit: Number.isFinite(limit) ? limit : 500 });
const after = getQuestionEmbeddingStats();

console.log(
  JSON.stringify(
    {
      ...result,
      stats: after,
    },
    null,
    2,
  ),
);

if (result.errors?.length) {
  process.exitCode = 1;
}
