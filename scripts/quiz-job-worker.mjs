/**
 * Standalone quiz job worker for Windows Task Scheduler or manual runs.
 * Use when the in-process worker in instrumentation.js is disabled.
 *
 * Example scheduled task (every minute):
 *   node C:\LittleCode\scripts\quiz-job-worker.mjs --once
 */
import { runQuizJobWorkerLoop } from "../lib/quiz-job-worker.js";

const once = process.argv.includes("--once");

if (once) {
  await runQuizJobWorkerLoop({ once: true });
} else {
  console.info("Quiz job worker running. Press Ctrl+C to stop.");
  await runQuizJobWorkerLoop();
}
