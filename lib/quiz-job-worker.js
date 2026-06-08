import { claimNextQuizJob, processQuizGenerationJob } from "./quiz-jobs.js";

const DEFAULT_POLL_MS = 3000;
let pollTimer = null;
let processing = false;

function pollIntervalMs() {
  const configured = Number(process.env.QUIZ_JOB_POLL_MS);
  return Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_POLL_MS;
}

export function isQuizJobWorkerRunning() {
  return pollTimer != null;
}

async function pollOnce() {
  if (processing) {
    return;
  }

  const job = claimNextQuizJob();
  if (!job) {
    return;
  }

  processing = true;
  try {
    await processQuizGenerationJob(job);
  } catch (error) {
    console.error(`Quiz job worker failed for job ${job.id}:`, error);
  } finally {
    processing = false;
  }
}

export function startQuizJobWorker() {
  if (pollTimer != null) {
    return;
  }

  if (process.env.QUIZ_JOB_WORKER_ENABLED === "false") {
    console.info("Quiz job worker disabled (QUIZ_JOB_WORKER_ENABLED=false).");
    return;
  }

  console.info(`Starting quiz job worker (poll every ${pollIntervalMs()}ms).`);
  pollTimer = setInterval(() => {
    pollOnce().catch((error) => {
      console.error("Quiz job worker poll error:", error);
    });
  }, pollIntervalMs());

  if (typeof pollTimer.unref === "function") {
    pollTimer.unref();
  }

  pollOnce().catch((error) => {
    console.error("Quiz job worker initial poll error:", error);
  });
}

export function stopQuizJobWorker() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function runQuizJobWorkerLoop({ once = false } = {}) {
  if (once) {
    await pollOnce();
    return;
  }

  startQuizJobWorker();
  return new Promise(() => {});
}
