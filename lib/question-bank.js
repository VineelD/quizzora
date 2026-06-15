import { getDb } from "./db.js";
import { getQuestionEmbeddingStats } from "./question-bank-embed.js";
import {
  agentShardForYearLevel,
  assignDifficultySlots,
  enumerateCurriculumCells,
} from "./question-bank-cells.js";

export function questionBankTargetPerCell() {
  const configured = Number(process.env.QUESTION_BANK_TARGET_PER_CELL || 60);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.round(configured), 200) : 60;
}

export function questionBankBatchChunkSize() {
  const configured = Number(process.env.QUESTION_BANK_BATCH_CHUNK_SIZE || 100);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.round(configured), 5000) : 100;
}

let questionBankTuningStartedAt = Date.now();
let lastEnqueuedTokenLimitAt = 0;
let temporaryMaxConcurrentReduction = 0;
let limitErrorBackoffUntil = 0;

const ESTIMATED_INPUT_TOKENS_PER_QUESTION = 2500;
const ESTIMATED_OUTPUT_TOKENS_PER_QUESTION = 500;
const OBSERVED_TOKENS_BLEND = 0.35;
const OBSERVED_TOKENS_SAFETY_FACTOR = 1.12;

let observedTokensPerQuestion = null;

export function resetQuestionBankTuningClock() {
  questionBankTuningStartedAt = Date.now();
}

export function resetObservedBatchTokenEstimate() {
  observedTokensPerQuestion = null;
}

/** @returns {number} Conservative per-question enqueued-token estimate (input + reserved output). */
export function estimatedTokensPerQuestion() {
  const conservative =
    ESTIMATED_INPUT_TOKENS_PER_QUESTION + ESTIMATED_OUTPUT_TOKENS_PER_QUESTION;
  if (
    observedTokensPerQuestion != null &&
    observedTokensPerQuestion > 0 &&
    observedTokensPerQuestion < conservative
  ) {
    return observedTokensPerQuestion;
  }
  return conservative;
}

/**
 * Blend measured batch usage into the rolling per-question estimate (never raises above conservative).
 * @param {number} questionCount
 * @param {number} totalTokens
 */
export function recordObservedBatchTokenUsage(questionCount, totalTokens) {
  const count = Number(questionCount);
  const tokens = Number(totalTokens);
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(tokens) || tokens <= 0) {
    return;
  }

  const measured = Math.ceil((tokens / count) * OBSERVED_TOKENS_SAFETY_FACTOR);
  const conservative =
    ESTIMATED_INPUT_TOKENS_PER_QUESTION + ESTIMATED_OUTPUT_TOKENS_PER_QUESTION;
  const capped = Math.min(measured, conservative);
  if (capped <= 0) {
    return;
  }

  observedTokensPerQuestion =
    observedTokensPerQuestion == null
      ? capped
      : Math.round(observedTokensPerQuestion * (1 - OBSERVED_TOKENS_BLEND) + capped * OBSERVED_TOKENS_BLEND);
}

export function hadLimitErrorInLastHour() {
  return lastEnqueuedTokenLimitAt > 0 && Date.now() - lastEnqueuedTokenLimitAt < 3_600_000;
}

export function recordQuestionBankLimitError() {
  lastEnqueuedTokenLimitAt = Date.now();
  temporaryMaxConcurrentReduction = Math.min(
    temporaryMaxConcurrentReduction + 1,
    Math.max(0, questionBankMaxConcurrentBatches() - 1),
  );
  limitErrorBackoffUntil = Date.now() + questionBankLimitErrorBackoffMs();
}

export function resetQuestionBankLimitBackoff() {
  temporaryMaxConcurrentReduction = 0;
  limitErrorBackoffUntil = 0;
}

export function isInLimitErrorBackoff() {
  return limitErrorBackoffUntil > Date.now();
}

export function questionBankLimitErrorBackoffMs() {
  const configured = Number(process.env.QUESTION_BANK_LIMIT_ERROR_BACKOFF_MS || 300000);
  return Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : 300000;
}

export function questionBankMaxEnqueuedTokens() {
  const configured = Number(process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS || 1800000);
  return Number.isFinite(configured) && configured > 0 ? Math.round(configured) : 1800000;
}

export function questionBankSubmitStaggerMs() {
  const configured = Number(process.env.QUESTION_BANK_SUBMIT_STAGGER_MS || 7500);
  return Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : 7500;
}

/** Enqueued-token estimate for one batch (input + reserved output). */
export function estimateBatchEnqueuedTokens(questionCount = null) {
  const count =
    Number.isFinite(questionCount) && questionCount > 0
      ? Math.round(questionCount)
      : questionBankEffectiveBatchChunkSize();
  return count * estimatedTokensPerQuestion();
}

export function questionBankAdaptiveChunkEnabled() {
  return process.env.QUESTION_BANK_ADAPTIVE_CHUNK === "true";
}

export function questionBankAdaptiveChunkMax() {
  const configured = Number(process.env.QUESTION_BANK_ADAPTIVE_CHUNK_MAX || 200);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.round(configured), 5000) : 200;
}

export function questionBankAdaptiveStableMs() {
  const configured = Number(process.env.QUESTION_BANK_ADAPTIVE_STABLE_MS || 3600000);
  return Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : 3600000;
}

/** Effective chunk — may rise after a stable period without enqueued-token failures. */
export function questionBankEffectiveBatchChunkSize() {
  const base = questionBankBatchChunkSize();
  if (!questionBankAdaptiveChunkEnabled()) {
    return base;
  }

  if (countActiveBatchAgents() > 1) {
    return base;
  }

  const maxChunk = questionBankAdaptiveChunkMax();
  const stableMs = questionBankAdaptiveStableMs();
  const anchor = Math.max(questionBankTuningStartedAt, lastEnqueuedTokenLimitAt || 0);
  if (Date.now() - anchor >= stableMs) {
    return Math.max(base, maxChunk);
  }

  return base;
}

export function questionBankEstimatedBatchMinutes() {
  const configured = Number(process.env.QUESTION_BANK_EST_BATCH_MINUTES || 35);
  return Number.isFinite(configured) && configured > 0 ? configured : 35;
}

export function computeQuestionBankThroughputEstimate(totals) {
  const remaining = Math.max(0, Number(totals?.targetTotal || 0) - Number(totals?.published || 0));
  const chunk = questionBankEffectiveBatchChunkSize();
  const delayMs = questionBankSubmitDelayMs();
  const batchMinutes = questionBankEstimatedBatchMinutes();
  const parallel = questionBankTheoreticalParallelBatches();
  const cycleHours = (batchMinutes * 60_000 + delayMs) / 3_600_000;
  const rejectFactor = 0.74;
  const theoreticalPerHour =
    cycleHours > 0 ? (chunk * rejectFactor * parallel) / cycleHours : 0;

  let observedPerHour = 0;
  const displayRun = totals?.displayRun;
  if (displayRun?.started_at) {
    const startedMs = Date.parse(String(displayRun.started_at).replace(" ", "T") + "Z");
    const elapsedHours = Number.isFinite(startedMs)
      ? Math.max((Date.now() - startedMs) / 3_600_000, 1 / 60)
      : 0;
    if (elapsedHours > 0) {
      observedPerHour = Number(totals.runPublished || 0) / elapsedHours;
    }
  }

  const publishedPerHour =
    observedPerHour >= 20 ? observedPerHour : theoreticalPerHour > 0 ? theoreticalPerHour : observedPerHour;

  const estimatedHours = publishedPerHour > 0 ? remaining / publishedPerHour : null;
  const estimatedCompletionAt =
    estimatedHours != null ? new Date(Date.now() + estimatedHours * 3_600_000).toISOString() : null;

  return {
    remaining,
    publishedPerHour: Math.round(publishedPerHour),
    observedPerHour: Math.round(observedPerHour),
    theoreticalPerHour: Math.round(theoreticalPerHour),
    estimatedHours: estimatedHours != null ? Math.round(estimatedHours * 10) / 10 : null,
    estimatedCompletionAt,
    effectiveChunkSize: chunk,
    theoreticalParallelBatches: parallel,
    batchTurnaroundMinutes: batchMinutes,
    adaptiveChunkActive:
      questionBankAdaptiveChunkEnabled() && chunk > questionBankBatchChunkSize(),
  };
}

/**
 * @param {Array<{ response?: { body?: { usage?: object } } }>} rows
 */
export function sumTokenUsageFromBatchOutputRows(rows) {
  let total = 0;
  for (const row of rows) {
    const usage = row?.response?.body?.usage;
    if (!usage) {
      continue;
    }
    const directTotal = Number(usage.total_tokens);
    if (Number.isFinite(directTotal) && directTotal > 0) {
      total += directTotal;
      continue;
    }
    total += (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0);
  }
  return total;
}

export function questionBankMaxConcurrentBatches() {
  const configured = Number(process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES || 2);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.round(configured), 6) : 2;
}

export function questionBankMinConcurrentBatches() {
  const configured = Number(process.env.QUESTION_BANK_MIN_CONCURRENT_BATCHES || 2);
  const max = questionBankMaxConcurrentBatches();
  const min = Number.isFinite(configured) && configured > 0 ? Math.round(configured) : 2;
  return Math.min(Math.max(1, min), max);
}

export function questionBankDynamicConcurrencyEnabled() {
  return (
    process.env.QUESTION_BANK_DYNAMIC_CONCURRENCY !== "false" &&
    questionBankMaxConcurrentBatches() > questionBankMinConcurrentBatches()
  );
}

/** Use the 3rd slot only when enqueued-token budget is below this usage percent. */
export function questionBankDynamicMaxUsagePercent() {
  const configured = Number(process.env.QUESTION_BANK_DYNAMIC_MAX_USAGE_PERCENT || 60);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.round(configured), 95) : 60;
}

/**
 * @param {{ tokenUsage?: object, openAiQuota?: object }} [options]
 */
export function resolveDynamicConcurrentCeiling(options = {}) {
  const configuredMax = questionBankMaxConcurrentBatches();
  const minConcurrent = questionBankMinConcurrentBatches();

  if (!questionBankDynamicConcurrencyEnabled()) {
    return configuredMax;
  }

  if (hadLimitErrorInLastHour() || isInLimitErrorBackoff()) {
    return minConcurrent;
  }

  const usage = options.tokenUsage || computeEnqueuedTokenUsage(options.openAiQuota || null);
  if (usage.tokenBudgetPercent >= questionBankDynamicMaxUsagePercent()) {
    return minConcurrent;
  }

  return configuredMax;
}

/** Best-case parallel batches for throughput / ETA (assumes favorable token headroom). */
export function questionBankTheoreticalParallelBatches() {
  return questionBankMaxConcurrentBatches();
}

/**
 * Effective cap — dynamic concurrency and temporary reduction after limit errors.
 * @param {{ tokenUsage?: object, openAiQuota?: object }} [options]
 */
export function questionBankEffectiveMaxConcurrentBatches(options = {}) {
  const ceiling = resolveDynamicConcurrentCeiling(options);
  return Math.max(1, ceiling - temporaryMaxConcurrentReduction);
}

export function isDynamicConcurrencyBoosted(options = {}) {
  return (
    questionBankDynamicConcurrencyEnabled() &&
    questionBankEffectiveMaxConcurrentBatches(options) > questionBankMinConcurrentBatches()
  );
}

const ACTIVE_BATCH_AGENT_STATUSES = new Set(["submitting", "batch_active", "ingesting"]);

export function isActiveBatchAgentStatus(status) {
  return ACTIVE_BATCH_AGENT_STATUSES.has(status);
}

export function deriveAgentDisplayStatus(agent, runId) {
  if (isActiveBatchAgentStatus(agent.status)) {
    return agent.status;
  }

  const hasWork = agentHasPendingWork(runId, agent.shard_key);
  const batchOnlyFill = questionBankFillMode() === "batch";
  const slotsFull =
    batchOnlyFill &&
    countActiveBatchAgents() >= questionBankEffectiveMaxConcurrentBatches({ openAiQuota: null });

  if (agent.status === "failed") {
    if (hasWork && slotsFull) {
      return "waiting_for_slot";
    }
    return "failed";
  }

  if (agent.status === "idle" && hasWork && slotsFull) {
    return "waiting_for_slot";
  }

  return agent.status;
}

export function questionBankSubmitBackoffMs() {
  const configured = Number(process.env.QUESTION_BANK_SUBMIT_BACKOFF_MS || 60000);
  return Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : 60000;
}

export function questionBankSubmitDelayMs() {
  const configured = Number(process.env.QUESTION_BANK_SUBMIT_DELAY_MS || 120000);
  return Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : 120000;
}

export function questionBankBatchModel() {
  return process.env.QUESTION_BANK_BATCH_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

/** @returns {"batch"|"sync"|"hybrid"} */
export function questionBankFillMode() {
  const mode = String(process.env.QUESTION_BANK_FILL_MODE || "sync").trim().toLowerCase();
  if (mode === "batch" || mode === "hybrid") {
    return mode;
  }
  return "sync";
}

export function questionBankFillModeLabel(mode = questionBankFillMode()) {
  if (mode === "batch") {
    return "Batch API";
  }
  if (mode === "hybrid") {
    return "Hybrid (batch + sync)";
  }
  return "Sync API";
}

export function questionBankSyncMaxConcurrency() {
  const configured = Number(process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY || 15);
  return Number.isFinite(configured) && configured >= 1 ? Math.round(configured) : 15;
}

export function questionBankSyncConcurrency() {
  const configured = Number(process.env.QUESTION_BANK_SYNC_CONCURRENCY || 3);
  const value = Number.isFinite(configured) && configured >= 1 ? Math.round(configured) : 3;
  return Math.min(value, questionBankSyncMaxConcurrency());
}

/** Org-wide — OpenAI enqueued-token limits apply across all runs. */
export function countActiveBatchAgents() {
  const row = getDb()
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM question_bank_agents
      WHERE status IN ('submitting', 'batch_active', 'ingesting')
    `,
    )
    .get();
  return Number(row?.count || 0);
}

export function getAgentsNeedingBatchPoll() {
  return getDb()
    .prepare(
      `
      SELECT *
      FROM question_bank_agents
      WHERE status IN ('batch_active', 'ingesting')
        AND openai_batch_id IS NOT NULL
      ORDER BY updated_at ASC
    `,
    )
    .all();
}

export function normalizeStuckBatchAgents() {
  const db = getDb();
  db.prepare(
    `
    UPDATE question_bank_agents
    SET status = 'idle', updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('submitting', 'batch_active') AND openai_batch_id IS NULL
  `,
  ).run();

  const stuck = db
    .prepare(
      `
      SELECT *
      FROM question_bank_agents
      WHERE status IN ('submitting', 'batch_active') AND openai_batch_id IS NULL
    `,
    )
    .all();

  for (const agent of stuck) {
    revertAgentSubmittedRequests(agent.run_id, agent.shard_key);
    updateAgent(agent.id, {
      status: "idle",
      requests_in_batch: 0,
      last_error: null,
    });
  }
}

/**
 * Sync fill only processes idle/failed agents. Demote leftover batch agents on the active run.
 * Published/rejected rows are untouched; submitted requests revert to pending.
 */
export function normalizeLegacyBatchAgentsForSyncMode(activeRunId = null) {
  if (questionBankFillMode() !== "sync") {
    return 0;
  }

  const run = activeRunId ? { id: activeRunId } : getActiveFillRun();
  if (!run?.id) {
    return 0;
  }

  const stuck = getDb()
    .prepare(
      `
      SELECT *
      FROM question_bank_agents
      WHERE run_id = ? AND status IN ('submitting', 'batch_active', 'ingesting')
    `,
    )
    .all(run.id);

  for (const agent of stuck) {
    revertAgentSubmittedRequests(agent.run_id, agent.shard_key);
    updateAgent(agent.id, {
      status: "idle",
      openai_batch_id: null,
      openai_input_file_id: null,
      openai_output_file_id: null,
      openai_error_file_id: null,
      requests_in_batch: 0,
      requests_ingested: 0,
      last_error: null,
    });
  }

  return stuck.length;
}

/**
 * Demote active batch agents on paused runs so they do not block quota slots.
 * Active-run agents are left alone — parallel batches are allowed when budget permits.
 */
export function normalizeOrphanedBatchAgents() {
  const db = getDb();
  const activeRun = getActiveFillRun();
  const orphans = db
    .prepare(
      `
      SELECT a.*
      FROM question_bank_agents a
      JOIN question_bank_fill_runs r ON r.id = a.run_id
      WHERE a.status IN ('submitting', 'batch_active', 'ingesting')
        AND r.status = 'paused'
        ${activeRun ? "AND a.run_id != ?" : ""}
      ORDER BY a.updated_at ASC
    `,
    )
    .all(...(activeRun ? [activeRun.id] : []));

  for (const agent of orphans) {
    revertAgentSubmittedRequests(agent.run_id, agent.shard_key);
    updateAgent(agent.id, {
      status: "idle",
      openai_batch_id: null,
      openai_input_file_id: null,
      openai_output_file_id: null,
      openai_error_file_id: null,
      requests_in_batch: 0,
      requests_ingested: 0,
      last_error: null,
    });
  }

  return orphans.length;
}

/** @deprecated Use normalizeOrphanedBatchAgents */
export function enforceSingleActiveBatchSlot() {
  normalizeOrphanedBatchAgents();
  const active = getDb()
    .prepare(
      `
      SELECT *
      FROM question_bank_agents
      WHERE status IN ('submitting', 'batch_active', 'ingesting')
      ORDER BY updated_at ASC
      LIMIT 1
    `,
    )
    .get();
  return active || null;
}

export function buildBatchTokenEstimatesFromAgents() {
  const rows = getDb()
    .prepare(
      `
      SELECT openai_batch_id, requests_in_batch, status
      FROM question_bank_agents
      WHERE status IN ('submitting', 'batch_active', 'ingesting')
    `,
    )
    .all();

  const batchTokenById = new Map();
  let pendingSubmitTokens = 0;

  for (const row of rows) {
    const tokens = estimateBatchEnqueuedTokens(
      row.requests_in_batch || questionBankEffectiveBatchChunkSize(),
    );
    if (row.openai_batch_id) {
      batchTokenById.set(row.openai_batch_id, tokens);
    }
    if (row.status === "submitting") {
      pendingSubmitTokens += tokens;
    }
  }

  return { batchTokenById, pendingSubmitTokens };
}

export function computeEnqueuedTokenUsage(openAiQuota = null, estimates = null) {
  const { batchTokenById, pendingSubmitTokens } = estimates || buildBatchTokenEstimatesFromAgents();
  const inProgress = Array.isArray(openAiQuota?.inProgress) ? openAiQuota.inProgress : [];
  let openAiInProgressTokens = 0;

  for (const batch of inProgress) {
    const batchId = String(batch?.id || "");
    openAiInProgressTokens +=
      batchTokenById.get(batchId) ?? estimateBatchEnqueuedTokens();
  }

  const enqueuedTokens = openAiInProgressTokens + pendingSubmitTokens;
  const tokenBudgetMax = questionBankMaxEnqueuedTokens();

  return {
    enqueuedTokens,
    openAiInProgressTokens,
    pendingSubmitTokens,
    tokenBudgetMax,
    tokenBudgetRemaining: Math.max(0, tokenBudgetMax - enqueuedTokens),
    tokenBudgetPercent:
      tokenBudgetMax > 0 ? Math.min(100, Math.round((enqueuedTokens / tokenBudgetMax) * 100)) : 0,
  };
}

/**
 * Decide whether another batch can be submitted this cycle.
 * @param {{ openAiQuota?: object, pendingSubmitsThisCycle?: number, withinSubmitCycle?: boolean }} [options]
 */
export function evaluateBatchSubmitCapacity(options = {}) {
  const pendingSubmitsThisCycle = Number(options.pendingSubmitsThisCycle || 0);
  const tokenUsage = computeEnqueuedTokenUsage(options.openAiQuota || null);
  const activeCount = countActiveBatchAgents();
  const maxConcurrent = questionBankEffectiveMaxConcurrentBatches({
    tokenUsage,
    openAiQuota: options.openAiQuota || null,
  });
  const slotsUsed = activeCount + pendingSubmitsThisCycle;
  const slotsAvailable = Math.max(0, maxConcurrent - slotsUsed);
  const nextBatchTokens = estimateBatchEnqueuedTokens();
  const canSubmitByCount = slotsAvailable > 0;
  const canSubmitByTokens =
    tokenUsage.enqueuedTokens + nextBatchTokens <= tokenUsage.tokenBudgetMax;
  const inBackoff = isInLimitErrorBackoff();

  return {
    canSubmit: canSubmitByCount && canSubmitByTokens && !inBackoff,
    canSubmitByCount,
    canSubmitByTokens,
    inBackoff,
    activeCount,
    maxConcurrent,
    slotsUsed,
    slotsAvailable,
    nextBatchTokens,
    ...tokenUsage,
  };
}

export function resetFailedAgentsWithTokenLimitError(runId) {
  const agents = getDb()
    .prepare(
      `
      SELECT *
      FROM question_bank_agents
      WHERE run_id = ? AND status = 'failed'
        AND last_error LIKE '%enqueued token limit%'
    `,
    )
    .all(runId);

  for (const agent of agents) {
    resetFailedAgentForRetry(agent.id);
  }

  return agents.length;
}

export function agentHasPendingWork(runId, shardKey) {
  const row = getDb()
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM question_bank_requests
      WHERE run_id = ? AND agent_shard = ? AND status IN ('pending', 'submitted')
    `,
    )
    .get(runId, shardKey);
  return Number(row?.count || 0) > 0;
}

export function revertAgentSubmittedRequests(runId, shardKey, batchId = null) {
  const db = getDb();
  if (batchId) {
    return db
      .prepare(
        `
        UPDATE question_bank_requests
        SET status = 'pending', batch_id = NULL
        WHERE run_id = ? AND agent_shard = ? AND batch_id = ? AND status = 'submitted'
      `,
      )
      .run(runId, shardKey, batchId).changes;
  }

  return db
    .prepare(
      `
      UPDATE question_bank_requests
      SET status = 'pending', batch_id = NULL
      WHERE run_id = ? AND agent_shard = ? AND status = 'submitted'
    `,
    )
    .run(runId, shardKey).changes;
}

export function resetFailedAgentForRetry(agentId) {
  const agent = getDb().prepare("SELECT * FROM question_bank_agents WHERE id = ?").get(agentId);
  if (!agent) {
    return null;
  }

  revertAgentSubmittedRequests(agent.run_id, agent.shard_key);

  updateAgent(agentId, {
    status: "idle",
    openai_batch_id: null,
    openai_input_file_id: null,
    openai_output_file_id: null,
    openai_error_file_id: null,
    requests_in_batch: 0,
    last_error: null,
  });

  return getDb().prepare("SELECT * FROM question_bank_agents WHERE id = ?").get(agentId);
}

export function countPublishedQuestionsForFocus(focusLabel) {
  const row = getDb()
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM question_bank_items
      WHERE focus_label = ? AND quality_status = 'published'
    `,
    )
    .get(focusLabel);
  return Number(row?.count || 0);
}

export function getQuestionBankTotals() {
  const db = getDb();
  const published = db
    .prepare(
      "SELECT COUNT(*) AS count FROM question_bank_items WHERE quality_status = 'published'",
    )
    .get();
  const rejected = db
    .prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE quality_status = 'rejected'")
    .get();

  const displayRun = getDisplayFillRun();
  const activeRun = getActiveFillRun();
  let pending = 0;
  let submitted = 0;
  let runPublished = 0;
  let runRejected = 0;

  if (displayRun) {
    const counts = db
      .prepare(
        `
        SELECT status, COUNT(*) AS count
        FROM question_bank_requests
        WHERE run_id = ?
        GROUP BY status
      `,
      )
      .all(displayRun.id);

    for (const row of counts) {
      if (row.status === "pending") {
        pending = Number(row.count);
      } else if (row.status === "submitted") {
        submitted = Number(row.count);
      } else if (row.status === "published") {
        runPublished = Number(row.count);
      } else if (row.status === "rejected") {
        runRejected = Number(row.count);
      }
    }
  }

  const cells = enumerateCurriculumCells().length;
  const targetPerCell = displayRun?.target_per_cell || questionBankTargetPerCell();
  const targetTotal = cells * targetPerCell;

  return {
    published: Number(published?.count || 0),
    rejectedStored: Number(rejected?.count || 0),
    targetTotal,
    targetPerCell,
    curriculumCells: cells,
    pending,
    submitted,
    runPublished,
    runRejected,
    activeRun: getActiveFillRun(),
    displayRun,
  };
}

export function getQuestionBankBreakdown() {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT year_level, subject, COUNT(*) AS published
      FROM question_bank_items
      WHERE quality_status = 'published'
      GROUP BY year_level, subject
      ORDER BY year_level, subject
    `,
    )
    .all();

  const targetPerCell = questionBankTargetPerCell();
  const cells = enumerateCurriculumCells();
  const cellCounts = new Map();

  for (const cell of cells) {
    const key = `${cell.yearLevel}::${cell.subject}`;
    cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
  }

  const breakdown = [];
  for (const [key, subtopicCount] of cellCounts.entries()) {
    const [yearLevel, subject] = key.split("::");
    const publishedRow = rows.find((row) => row.year_level === yearLevel && row.subject === subject);
    breakdown.push({
      yearLevel,
      subject,
      subtopics: subtopicCount,
      target: subtopicCount * targetPerCell,
      published: Number(publishedRow?.published || 0),
    });
  }

  breakdown.sort((left, right) => {
    const yearDelta = left.yearLevel.localeCompare(right.yearLevel, undefined, { numeric: true });
    return yearDelta !== 0 ? yearDelta : left.subject.localeCompare(right.subject);
  });

  return breakdown;
}

export function getActiveFillRun() {
  return (
    getDb()
      .prepare(
        `
        SELECT *
        FROM question_bank_fill_runs
        WHERE status = 'running'
        ORDER BY id DESC
        LIMIT 1
      `,
      )
      .get() || null
  );
}

export function getLatestFillRun() {
  return (
    getDb().prepare("SELECT * FROM question_bank_fill_runs ORDER BY id DESC LIMIT 1").get() || null
  );
}

export function getDisplayFillRun() {
  return getActiveFillRun() || getLatestFillRun();
}

export function getFillRunAgents(runId) {
  return getDb()
    .prepare(
      `
      SELECT *
      FROM question_bank_agents
      WHERE run_id = ?
      ORDER BY year_level
    `,
    )
    .all(runId);
}

export function pauseActiveFillRun() {
  const run = getActiveFillRun();
  if (!run) {
    return null;
  }

  getDb()
    .prepare(
      `
      UPDATE question_bank_fill_runs
      SET status = 'paused', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    )
    .run(run.id);

  return getDb().prepare("SELECT * FROM question_bank_fill_runs WHERE id = ?").get(run.id);
}

export function pauseAllFillRuns() {
  getDb()
    .prepare(
      `
      UPDATE question_bank_fill_runs
      SET status = 'paused', completed_at = CURRENT_TIMESTAMP
      WHERE status = 'running'
    `,
    )
    .run();
}

export function pauseOtherFillRuns(exceptRunId) {
  getDb()
    .prepare(
      `
      UPDATE question_bank_fill_runs
      SET status = 'paused', completed_at = CURRENT_TIMESTAMP
      WHERE status = 'running' AND id != ?
    `,
    )
    .run(exceptRunId);
}

export function getPausedFillRunWithPending() {
  return (
    getDb()
      .prepare(
        `
        SELECT r.*
        FROM question_bank_fill_runs r
        WHERE r.status = 'paused'
          AND EXISTS (
            SELECT 1
            FROM question_bank_requests q
            WHERE q.run_id = r.id AND q.status IN ('pending', 'submitted')
          )
        ORDER BY (
          SELECT COUNT(*)
          FROM question_bank_requests q
          WHERE q.run_id = r.id AND q.status IN ('published', 'submitted')
        ) DESC, r.id DESC
        LIMIT 1
      `,
      )
      .get() || null
  );
}

export function normalizeAgentsForRun(runId) {
  const db = getDb();
  db.prepare(
    `
    UPDATE question_bank_agents
    SET status = 'idle', updated_at = CURRENT_TIMESTAMP
    WHERE run_id = ? AND status = 'submitting' AND openai_batch_id IS NULL
  `,
  ).run(runId);

  for (const agent of getFillRunAgents(runId)) {
    if (agent.status === "completed" && agentHasPendingWork(runId, agent.shard_key)) {
      updateAgent(agent.id, { status: "idle" });
    }
  }
}

export function resumeFillRun(runId) {
  const db = getDb();
  const run = db.prepare("SELECT * FROM question_bank_fill_runs WHERE id = ?").get(runId);
  if (!run || run.status !== "paused") {
    return null;
  }

  db.prepare(
    `
    UPDATE question_bank_fill_runs
    SET status = 'running', completed_at = NULL
    WHERE id = ?
  `,
  ).run(runId);

  pauseOtherFillRuns(runId);
  normalizeAgentsForRun(runId);

  return db.prepare("SELECT * FROM question_bank_fill_runs WHERE id = ?").get(runId);
}

/**
 * @returns {{ run: object, agents: object[], requestsCreated: number, alreadyRunning?: boolean, resumed?: boolean }}
 */
export function startQuestionBankFillRun() {
  const existing = getActiveFillRun();
  if (existing) {
    return {
      run: existing,
      agents: getFillRunAgents(existing.id),
      requestsCreated: 0,
      alreadyRunning: true,
      resumed: false,
    };
  }

  const paused = getPausedFillRunWithPending();
  if (paused) {
    const run = resumeFillRun(paused.id);
    if (run) {
      return {
        run,
        agents: getFillRunAgents(run.id),
        requestsCreated: 0,
        alreadyRunning: false,
        resumed: true,
      };
    }
  }

  const db = getDb();
  const targetPerCell = questionBankTargetPerCell();
  const cells = enumerateCurriculumCells();

  const insertRun = db.prepare(`
    INSERT INTO question_bank_fill_runs (status, target_per_cell, requests_total)
    VALUES ('running', ?, 0)
  `);
  const runResult = insertRun.run(targetPerCell);
  const runId = Number(runResult.lastInsertRowid);
  pauseOtherFillRuns(runId);

  const yearLevels = [...new Set(cells.map((cell) => cell.yearLevel))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const insertAgent = db.prepare(`
    INSERT INTO question_bank_agents (run_id, shard_key, year_level, status)
    VALUES (?, ?, ?, 'idle')
  `);

  for (const yearLevel of yearLevels) {
    insertAgent.run(runId, agentShardForYearLevel(yearLevel), yearLevel);
  }

  const insertRequest = db.prepare(`
    INSERT INTO question_bank_requests (
      run_id, agent_shard, custom_id, focus_label, year_level, subject,
      topic_key, subtopic, acara_codes, difficulty, question_style, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `);

  let requestsCreated = 0;
  db.exec("BEGIN");
  try {
    for (const cell of cells) {
      const existingCount = countPublishedQuestionsForFocus(cell.focusLabel);
      const deficit = Math.max(0, targetPerCell - existingCount);
      if (deficit <= 0) {
        continue;
      }

      const difficulties = assignDifficultySlots(deficit);
      for (let index = 0; index < deficit; index += 1) {
        const requestId = `${runId}-${requestsCreated + index + 1}`;
        const customId = `qb-${requestId}`;
        const difficulty = difficulties[index] || "core";
        insertRequest.run(
          runId,
          agentShardForYearLevel(cell.yearLevel),
          customId,
          cell.focusLabel,
          cell.yearLevel,
          cell.subject,
          cell.topicKey,
          cell.subtopic,
          cell.acaraCodes,
          difficulty,
          difficulty === "extension" ? "worded" : "mixed",
        );
      }
      requestsCreated += deficit;
    }

    db.prepare(
      `
      UPDATE question_bank_fill_runs
      SET requests_total = ?
      WHERE id = ?
    `,
    ).run(requestsCreated, runId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const run = db.prepare("SELECT * FROM question_bank_fill_runs WHERE id = ?").get(runId);
  const agents = getFillRunAgents(runId);

  return { run, agents, requestsCreated, alreadyRunning: false, resumed: false };
}

export function listPendingRequestsForShard(runId, shardKey, limit) {
  return getDb()
    .prepare(
      `
      SELECT *
      FROM question_bank_requests
      WHERE run_id = ? AND agent_shard = ? AND status = 'pending'
      ORDER BY id
      LIMIT ?
    `,
    )
    .all(runId, shardKey, limit);
}

/** @deprecated Use listPendingRequestsForShard */
export function claimPendingRequestsForShard(runId, shardKey, limit) {
  return listPendingRequestsForShard(runId, shardKey, limit);
}

export function insertPublishedQuestion({
  requestRow,
  question,
  contentHash,
  fillRunId,
}) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO question_bank_items (
      focus_label, year_level, subject, topic_key, subtopic, acara_codes,
      difficulty, question_style, question_json, content_hash, quality_status,
      source, fill_run_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'openai_batch', ?)
  `);

  try {
    insert.run(
      requestRow.focus_label,
      requestRow.year_level,
      requestRow.subject,
      requestRow.topic_key,
      requestRow.subtopic,
      requestRow.acara_codes,
      requestRow.difficulty,
      requestRow.question_style,
      JSON.stringify(question),
      contentHash,
      fillRunId,
    );
    return true;
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE constraint failed")) {
      return false;
    }
    throw error;
  }
}

export function markRequestOutcome(requestId, { status, rejectReason = null }) {
  getDb()
    .prepare(
      `
      UPDATE question_bank_requests
      SET status = ?, reject_reason = ?
      WHERE id = ?
    `,
    )
    .run(status, rejectReason, requestId);
}

export function bumpRunCounters(runId, { published = 0, rejected = 0 }) {
  if (!published && !rejected) {
    return;
  }

  getDb()
    .prepare(
      `
      UPDATE question_bank_fill_runs
      SET
        requests_published = requests_published + ?,
        requests_rejected = requests_rejected + ?
      WHERE id = ?
    `,
    )
    .run(published, rejected, runId);
}

export function updateAgent(agentId, fields) {
  const allowed = [
    "status",
    "openai_batch_id",
    "openai_input_file_id",
    "openai_output_file_id",
    "openai_error_file_id",
    "requests_in_batch",
    "requests_ingested",
    "last_error",
  ];
  const entries = Object.entries(fields).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (!entries.length) {
    return;
  }

  const sets = entries.map(([key]) => `${key} = ?`);
  sets.push("updated_at = CURRENT_TIMESTAMP");
  const values = entries.map(([, value]) => value);
  values.push(agentId);

  getDb()
    .prepare(`UPDATE question_bank_agents SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function getRequestByCustomId(customId) {
  return (
    getDb().prepare("SELECT * FROM question_bank_requests WHERE custom_id = ?").get(customId) || null
  );
}

export function maybeCompleteFillRun(runId) {
  const db = getDb();
  const run = db.prepare("SELECT requests_total FROM question_bank_fill_runs WHERE id = ?").get(runId);
  if (!run || Number(run.requests_total || 0) <= 0) {
    return;
  }

  const pending = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM question_bank_requests
      WHERE run_id = ? AND status IN ('pending', 'submitted')
    `,
    )
    .get(runId);

  const activeAgents = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM question_bank_agents
      WHERE run_id = ? AND status IN ('submitting', 'batch_active', 'ingesting')
    `,
    )
    .get(runId);

  if (Number(pending?.count || 0) === 0 && Number(activeAgents?.count || 0) === 0) {
    db.prepare(
      `
      UPDATE question_bank_fill_runs
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'running'
    `,
    ).run(runId);
  }
}

export function getQuestionBankStatusPayload(extra = {}) {
  const totals = getQuestionBankTotals();
  const embeddings = getQuestionEmbeddingStats();
  const breakdown = getQuestionBankBreakdown();
  const displayRun = getDisplayFillRun();
  const agents = displayRun ? getFillRunAgents(displayRun.id) : [];
  const activeBatchCount = countActiveBatchAgents();
  const maxConcurrent = questionBankMaxConcurrentBatches();
  const tokenBudget = computeEnqueuedTokenUsage(extra.openAiQuota || null);
  const effectiveMaxConcurrent = questionBankEffectiveMaxConcurrentBatches({
    tokenUsage: tokenBudget,
    openAiQuota: extra.openAiQuota || null,
  });
  const throughput = computeQuestionBankThroughputEstimate(totals);
  const submitCapacity = evaluateBatchSubmitCapacity({ openAiQuota: extra.openAiQuota || null });

  return {
    totals,
    breakdown,
    agents: agents.map((agent) => ({
      id: agent.id,
      yearLevel: agent.year_level,
      status: deriveAgentDisplayStatus(agent, displayRun.id),
      openaiBatchId: agent.openai_batch_id,
      requestsInBatch: agent.requests_in_batch,
      requestsIngested: agent.requests_ingested,
      lastError: agent.last_error,
      updatedAt: agent.updated_at,
    })),
    workerEnabled: process.env.QUESTION_BANK_WORKER_ENABLED !== "false",
    fillMode: questionBankFillMode(),
    fillModeLabel: questionBankFillModeLabel(),
    syncConcurrency: questionBankSyncConcurrency(),
    syncMaxConcurrency: questionBankSyncMaxConcurrency(),
    model: questionBankBatchModel(),
    maxConcurrentBatches: maxConcurrent,
    minConcurrentBatches: questionBankMinConcurrentBatches(),
    effectiveMaxConcurrentBatches: effectiveMaxConcurrent,
    dynamicConcurrencyEnabled: questionBankDynamicConcurrencyEnabled(),
    dynamicConcurrencyBoosted: isDynamicConcurrencyBoosted({
      tokenUsage: tokenBudget,
      openAiQuota: extra.openAiQuota || null,
    }),
    observedTokensPerQuestion: observedTokensPerQuestion,
    batchChunkSize: questionBankBatchChunkSize(),
    effectiveBatchChunkSize: throughput.effectiveChunkSize,
    adaptiveChunkEnabled: questionBankAdaptiveChunkEnabled(),
    adaptiveChunkActive: throughput.adaptiveChunkActive,
    submitDelayMs: questionBankSubmitDelayMs(),
    submitStaggerMs: questionBankSubmitStaggerMs(),
    activeBatchCount,
    slotsUsed: submitCapacity.slotsUsed,
    slotsAvailable: submitCapacity.slotsAvailable,
    canSubmitNewBatch: submitCapacity.canSubmit,
    tokenBudget,
    estimatedBatchTokens: estimateBatchEnqueuedTokens(),
    limitErrorBackoff: isInLimitErrorBackoff(),
    targetPerCell: questionBankTargetPerCell(),
    throughput,
    openAiQuota: extra.openAiQuota || null,
    embeddings,
  };
}
