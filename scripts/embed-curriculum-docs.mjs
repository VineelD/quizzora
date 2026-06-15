/**
 * Embed curriculum_doc_chunks with Ollama (nomic-embed-text by default).
 * Re-embeds rows when OLLAMA_EMBED_MODEL changes (source text in content column is preserved).
 *
 *   node scripts/embed-curriculum-docs.mjs
 *   node scripts/embed-curriculum-docs.mjs --batch 25
 */
import { embedCurriculumChunksBatch, listChunksNeedingEmbedding } from "../lib/curriculum-doc-embed.js";
import { getCurriculumDocStatusPayload } from "../lib/curriculum-doc-status.js";
import { getDb } from "../lib/db.js";

function parseArgs(argv) {
  const options = { batch: 50 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--batch") {
      options.batch = Number(argv[index + 1]);
      index += 1;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
getDb();

const pending = listChunksNeedingEmbedding({ limit: 100000 });
if (pending.length === 0) {
  console.log("No chunks need embedding.");
  console.log(JSON.stringify(getCurriculumDocStatusPayload(), null, 2));
  process.exit(0);
}

console.log(`Embedding ${pending.length} chunk(s) in batches of ${options.batch}...`);

let embedded = 0;
let failed = 0;

while (true) {
  const batch = listChunksNeedingEmbedding({ limit: options.batch });
  if (batch.length === 0) {
    break;
  }

  const results = await embedCurriculumChunksBatch({ limit: options.batch });
  for (const result of results) {
    if (result.ok) {
      embedded += 1;
      console.log(`OK  chunk ${result.id} (${result.focusLabel})`);
    } else {
      failed += 1;
      console.error(`FAIL chunk ${result.id} (${result.focusLabel}): ${result.error}`);
    }
  }
}

console.log(JSON.stringify({ embedded, failed, status: getCurriculumDocStatusPayload() }, null, 2));
