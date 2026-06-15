/**
 * Poll for curriculum_doc_chunks needing embedding; run embed batches on an interval.
 *
 *   node scripts/embed-curriculum-docs-poll.mjs
 *   node scripts/embed-curriculum-docs-poll.mjs --interval 90 --batch 50
 */
import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listChunksNeedingEmbedding } from "../lib/curriculum-doc-embed.js";
import { getDb } from "../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOG = path.join(__dirname, "_curriculum-embed.log");

function parseArgs(argv) {
  const options = { intervalSec: 90, batch: 50 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--interval") {
      options.intervalSec = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--batch") {
      options.batch = Number(argv[index + 1]);
      index += 1;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}\n`;
  appendFileSync(LOG, msg, { encoding: "utf8" });
}

function runEmbedBatch() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/embed-curriculum-docs.mjs", "--batch", String(options.batch)],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (output.trim()) {
        appendFileSync(LOG, `${output.trimEnd()}\n`, { encoding: "utf8" });
      }
      resolve(code ?? 0);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

getDb();
log(`embed poll loop started (PID ${process.pid}, interval ${options.intervalSec}s, batch ${options.batch})`);

while (true) {
  const pending = listChunksNeedingEmbedding({ limit: 1 });
  if (pending.length > 0) {
    log(`pending chunks detected, running embed batch ${options.batch}...`);
    await runEmbedBatch();
  } else {
    log("no pending chunks, skipping embed");
  }
  await sleep(Math.max(1, options.intervalSec) * 1000);
}
