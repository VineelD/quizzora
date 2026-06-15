/**
 * Post-enrichment pipeline: export, HTML, Onyx bundle prep, embed, optional upload.
 *
 *   node scripts/run-curriculum-enrich-pipeline.mjs
 *   node scripts/run-curriculum-enrich-pipeline.mjs --upload
 *   node scripts/run-curriculum-enrich-pipeline.mjs --skip-embed
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function parseArgs(argv) {
  const options = { upload: false, skipEmbed: false };
  for (const arg of argv) {
    if (arg === "--upload") {
      options.upload = true;
    } else if (arg === "--skip-embed") {
      options.skipEmbed = true;
    }
  }
  return options;
}

function runStep(label, script, args = []) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(node, [path.join(__dirname, script), ...args], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (${script})`);
  }
}

const options = parseArgs(process.argv.slice(2));

runStep("Word count snapshot (after)", "_curriculum-wordcount-snapshot.mjs", ["--label", "after"]);
runStep("Export markdown", "export-curriculum-docs.mjs");
runStep("Export KaTeX HTML", "export-curriculum-docs-html.mjs");
runStep("Prepare Onyx bundle", "prepare-curriculum-file-connector.mjs");

if (!options.skipEmbed) {
  runStep("Embed curriculum chunks", "embed-curriculum-docs.mjs", ["--batch", "25"]);
}

if (options.upload) {
  runStep("Upload to Onyx", "upload-curriculum-file-connector.mjs");
  runStep("Verify Onyx status", "upload-curriculum-file-connector.mjs", ["--status"]);
}

console.log("\nPipeline complete.");
