import { isEnqueuedTokenLimitError, pollAndIngestAgentBatch, submitAgentBatch } from "./question-bank-fill.js";

import { getOpenAiBatchQuotaSummary } from "./openai-batch.js";

import { processSyncFillForAgents } from "./question-bank-sync-fill.js";

import {

  agentHasPendingWork,

  countActiveBatchAgents,

  evaluateBatchSubmitCapacity,

  getActiveFillRun,

  getAgentsNeedingBatchPoll,

  getFillRunAgents,

  isActiveBatchAgentStatus,

  isInLimitErrorBackoff,

  normalizeLegacyBatchAgentsForSyncMode,

  normalizeOrphanedBatchAgents,

  normalizeStuckBatchAgents,

  questionBankEffectiveBatchChunkSize,

  questionBankEffectiveMaxConcurrentBatches,

  questionBankFillMode,

  questionBankFillModeLabel,

  questionBankMaxConcurrentBatches,

  questionBankSubmitBackoffMs,

  questionBankSubmitDelayMs,

  questionBankSubmitStaggerMs,

  questionBankSyncConcurrency,

  recordQuestionBankLimitError,

  resetQuestionBankTuningClock,

  resetFailedAgentForRetry,

  updateAgent,

} from "./question-bank.js";



const DEFAULT_POLL_MS = 5000;

let pollTimer = null;

let processing = false;

let submitInProgress = false;

let lastBatchSubmittedAt = 0;

const retryNotBefore = new Map();



function pollIntervalMs() {

  const configured = Number(process.env.QUESTION_BANK_POLL_MS);

  return Number.isFinite(configured) && configured >= 2000 ? configured : DEFAULT_POLL_MS;

}



function sleep(ms) {

  return new Promise((resolve) => setTimeout(resolve, ms));

}



export function isQuestionBankWorkerRunning() {

  return pollTimer != null;

}



/**

 * @param {{ openAiQuota?: object, pendingSubmitsThisCycle?: number, withinSubmitCycle?: boolean }} [context]

 */

export function canSubmitNewBatch(context = {}) {

  if (submitInProgress && !context.withinSubmitCycle) {

    return false;

  }



  if (!context.withinSubmitCycle) {

    const delayMs = questionBankSubmitDelayMs();

    if (delayMs > 0 && lastBatchSubmittedAt > 0 && Date.now() - lastBatchSubmittedAt < delayMs) {

      return false;

    }

  }



  const capacity = evaluateBatchSubmitCapacity({

    openAiQuota: context.openAiQuota || null,

    pendingSubmitsThisCycle: context.pendingSubmitsThisCycle || 0,

  });

  return capacity.canSubmit;

}



export function findActiveBatchAgent(agents) {

  return agents.find((agent) => isActiveBatchAgentStatus(agent.status)) || null;

}



export function shouldRetryFailedAgent(agent) {

  if (agent.status !== "failed") {

    return false;

  }



  const pending = agentHasPendingWork(agent.run_id, agent.shard_key);

  if (!pending) {

    return false;

  }



  const notBefore = retryNotBefore.get(agent.id);

  if (notBefore && Date.now() < notBefore) {

    return false;

  }



  return true;

}



export function scheduleFailedAgentRetry(agentId) {

  retryNotBefore.set(agentId, Date.now() + questionBankSubmitBackoffMs());

}



export function prepareFailedAgentForRetry(agent) {

  resetFailedAgentForRetry(agent.id);

  scheduleFailedAgentRetry(agent.id);

}



/** @param {string} [fillMode] */

export function shouldRunBatchSubmitThisCycle(fillMode = questionBankFillMode()) {

  return fillMode === "batch" || fillMode === "hybrid";

}



/**

 * @param {{ fillMode?: string, batchSelection?: { agents?: object[], reason?: string } }} [context]

 */

export function shouldRunSyncFillThisCycle(context = {}) {

  const fillMode = context.fillMode || questionBankFillMode();

  if (fillMode === "sync") {

    return true;

  }

  if (fillMode !== "hybrid") {

    return false;

  }



  const selection = context.batchSelection || { agents: [], reason: "none" };

  if (!selection.agents?.length) {

    return true;

  }



  return selection.reason === "slots_full" || selection.reason === "token_budget_full";

}



/**

 * Pick agents to submit this poll cycle (up to available parallel slots).

 * @param {object[]} agents

 * @param {{ openAiQuota?: object }} [context]

 */

export function selectAgentsForPollCycle(agents, context = {}) {

  if (!shouldRunBatchSubmitThisCycle()) {

    return { agents: [], reason: "sync_mode" };

  }



  if (isInLimitErrorBackoff()) {

    return { agents: [], reason: "limit_error_backoff" };

  }



  const capacity = evaluateBatchSubmitCapacity({ openAiQuota: context.openAiQuota || null });

  if (!capacity.canSubmit && capacity.slotsAvailable <= 0) {

    return { agents: [], reason: "slots_full", capacity };

  }



  const selected = [];

  const usedIds = new Set();



  function tryAdd(agent, reason) {

    if (!agent || usedIds.has(agent.id)) {

      return false;

    }

    if (!canSubmitNewBatch({

      openAiQuota: context.openAiQuota,

      pendingSubmitsThisCycle: selected.length,

      withinSubmitCycle: selected.length > 0,

    })) {

      return false;

    }

    selected.push({ agent, reason });

    usedIds.add(agent.id);

    return true;

  }



  for (const agent of agents) {

    if (shouldRetryFailedAgent(agent)) {

      tryAdd(agent, "retry_failed");

    }

  }



  for (const agent of agents) {

    if (agent.status === "idle" || agent.status === "submitting") {

      if (agentHasPendingWork(agent.run_id, agent.shard_key)) {

        tryAdd(agent, "submit_idle");

      }

    }

  }



  if (!selected.length) {

    return { agents: [], reason: capacity.canSubmit ? "none" : "token_budget_full", capacity };

  }



  return { agents: selected, reason: "submit", capacity };

}



/** @deprecated Use selectAgentsForPollCycle */

export function selectAgentForPollCycle(agents, context = {}) {

  const result = selectAgentsForPollCycle(agents, context);

  const first = result.agents[0];

  return {

    agent: first?.agent || null,

    reason: first?.reason || result.reason,

    capacity: result.capacity,

  };

}



async function pollAllActiveBatches() {

  const agents = getAgentsNeedingBatchPoll();

  for (const agent of agents) {

    try {

      await pollAndIngestAgentBatch(agent);

    } catch (error) {

      console.error(

        `Question bank agent ${agent.id} (run ${agent.run_id}, ${agent.year_level}) poll failed:`,

        error,

      );

      if (isEnqueuedTokenLimitError(error?.message)) {

        recordQuestionBankLimitError();

        updateAgent(agent.id, { status: "failed", last_error: error.message });

        scheduleFailedAgentRetry(agent.id);

      }

    }

  }

}



async function processAgent(agent) {

  if (agent.status === "failed") {

    if (!shouldRetryFailedAgent(agent)) {

      return { action: "skip" };

    }



    prepareFailedAgentForRetry(agent);

    submitInProgress = true;

    try {

      await submitAgentBatch({ ...agent, status: "idle", openai_batch_id: null });

      lastBatchSubmittedAt = Date.now();

      retryNotBefore.delete(agent.id);

      return { action: "submitted" };

    } finally {

      submitInProgress = false;

    }

  }



  if (agent.status === "completed") {

    return { action: "skip" };

  }



  if (agent.status === "batch_active" || agent.status === "ingesting") {

    if (agent.openai_batch_id) {

      await pollAndIngestAgentBatch(agent);

    }

    return { action: "polled" };

  }



  if (agent.status === "idle" || agent.status === "submitting") {

    submitInProgress = true;

    try {

      await submitAgentBatch(agent);

      lastBatchSubmittedAt = Date.now();

      return { action: "submitted" };

    } finally {

      submitInProgress = false;

    }

  }



  return { action: "skip" };

}



async function processBatchSubmissions(agents, openAiQuota) {

  const selection = selectAgentsForPollCycle(agents, { openAiQuota });

  if (!selection.agents.length) {

    return { selection, submitted: false };

  }



  const staggerMs = questionBankSubmitStaggerMs();

  for (let index = 0; index < selection.agents.length; index += 1) {

    if (index > 0 && staggerMs > 0) {

      await sleep(staggerMs);

    }



    const { agent } = selection.agents[index];

    if (

      !canSubmitNewBatch({

        openAiQuota,

        pendingSubmitsThisCycle: index,

        withinSubmitCycle: index > 0,

      })

    ) {

      break;

    }



    try {

      await processAgent(agent);

    } catch (error) {

      console.error(`Question bank agent ${agent.id} (${agent.year_level}) failed:`, error);

      if (isEnqueuedTokenLimitError(error?.message)) {

        recordQuestionBankLimitError();

        updateAgent(agent.id, { status: "failed", last_error: error.message });

        scheduleFailedAgentRetry(agent.id);

        break;

      }

    }

  }



  return { selection, submitted: true };

}



async function processSyncCycle(agents, runId) {

  for (const agent of agents) {

    if (shouldRetryFailedAgent(agent)) {

      prepareFailedAgentForRetry(agent);

    }

  }



  const freshAgents = getFillRunAgents(runId);

  const result = await processSyncFillForAgents(freshAgents);

  if (result.limitError) {

    recordQuestionBankLimitError();

  }

  return result;

}



async function pollOnce() {

  if (processing) {

    return;

  }



  processing = true;

  try {

    normalizeStuckBatchAgents();

    normalizeOrphanedBatchAgents();

    normalizeLegacyBatchAgentsForSyncMode();



    await pollAllActiveBatches();



    const run = getActiveFillRun();

    if (!run) {

      return;

    }



    const fillMode = questionBankFillMode();

    const agents = getFillRunAgents(run.id);



    let openAiQuota = null;

    if (shouldRunBatchSubmitThisCycle(fillMode)) {

      try {

        openAiQuota = await getOpenAiBatchQuotaSummary();

      } catch (error) {

        console.warn("Question bank worker could not query OpenAI batch quota:", error?.message || error);

      }

    }



    let batchSelection = { agents: [], reason: "sync_mode" };

    if (shouldRunBatchSubmitThisCycle(fillMode)) {

      const batchResult = await processBatchSubmissions(agents, openAiQuota);

      batchSelection = batchResult.selection;

    }



    if (shouldRunSyncFillThisCycle({ fillMode, batchSelection })) {

      try {

        let syncResult;

        do {

          const syncAgents = getFillRunAgents(run.id);

          syncResult = await processSyncCycle(syncAgents, run.id);

        } while (syncResult.processed > 0 && !syncResult.limitError);

      } catch (error) {

        console.error("Question bank sync fill failed:", error);

      }

    }

  } finally {

    processing = false;

  }

}



export function startQuestionBankWorker() {

  if (pollTimer != null) {

    return;

  }



  if (process.env.QUESTION_BANK_WORKER_ENABLED === "false") {

    console.info("Question bank worker disabled (QUESTION_BANK_WORKER_ENABLED=false).");

    return;

  }



  resetQuestionBankTuningClock();

  const fillMode = questionBankFillMode();

  console.info(

    `Starting question bank worker (fill mode: ${questionBankFillModeLabel(fillMode)}, poll every ${pollIntervalMs()}ms, max ${questionBankEffectiveMaxConcurrentBatches()}/${questionBankMaxConcurrentBatches()} concurrent batches, chunk ${questionBankEffectiveBatchChunkSize()}, sync concurrency ${questionBankSyncConcurrency()}, submit delay ${questionBankSubmitDelayMs()}ms, stagger ${questionBankSubmitStaggerMs()}ms).`,

  );

  pollTimer = setInterval(() => {

    pollOnce().catch((error) => {

      console.error("Question bank worker poll error:", error);

    });

  }, pollIntervalMs());



  if (typeof pollTimer.unref === "function") {

    pollTimer.unref();

  }



  pollOnce().catch((error) => {

    console.error("Question bank worker initial poll error:", error);

  });

}



export function stopQuestionBankWorker() {

  if (pollTimer != null) {

    clearInterval(pollTimer);

    pollTimer = null;

  }

}



export async function runQuestionBankWorkerLoop({ once = false } = {}) {

  if (once) {

    await pollOnce();

    return;

  }



  startQuestionBankWorker();

  return new Promise(() => {});

}


