/**
 * Standalone question bank worker for Windows Task Scheduler or manual runs.
 *
 * Example:
 *   node C:\LittleCode\scripts\question-bank-worker.mjs --once
 */
import { runQuestionBankWorkerLoop } from "../lib/question-bank-worker.js";

const once = process.argv.includes("--once");

if (once) {
  await runQuestionBankWorkerLoop({ once: true });
} else {
  console.info("Question bank worker running. Press Ctrl+C to stop.");
  await runQuestionBankWorkerLoop();
}
