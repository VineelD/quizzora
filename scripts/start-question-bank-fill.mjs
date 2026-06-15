/**
 * Seed a fill run for all curriculum cells and kick the worker once.
 *
 *   node C:\LittleCode\scripts\start-question-bank-fill.mjs
 */
import { getQuestionBankStatusPayload, startQuestionBankFillRun } from "../lib/question-bank.js";
import { runQuestionBankWorkerLoop } from "../lib/question-bank-worker.js";

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error("OPENAI_API_KEY is missing.");
  process.exit(1);
}

const started = startQuestionBankFillRun();
console.log("Fill run:", started.run?.id, "requests:", started.requestsCreated);

await runQuestionBankWorkerLoop({ once: true });

console.log(JSON.stringify(getQuestionBankStatusPayload(), null, 2));
