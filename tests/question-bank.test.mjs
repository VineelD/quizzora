import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-qb-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");

const db = await import("../lib/db.js");

before(() => {
  db.resetDatabaseForTests();
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});
import {
  agentShardForYearLevel,
  assignDifficultySlots,
  enumerateCurriculumCells,
} from "../lib/question-bank-cells.js";
import {
  countActiveBatchAgents,
  deriveAgentDisplayStatus,
  estimateBatchEnqueuedTokens,
  estimatedTokensPerQuestion,
  evaluateBatchSubmitCapacity,
  hadLimitErrorInLastHour,
  isDynamicConcurrencyBoosted,
  questionBankEffectiveMaxConcurrentBatches,
  questionBankMinConcurrentBatches,
  recordObservedBatchTokenUsage,
  resetObservedBatchTokenEstimate,
  getQuestionBankStatusPayload,
  getFillRunAgents,
  getPausedFillRunWithPending,
  normalizeOrphanedBatchAgents,
  pauseActiveFillRun,
  pauseAllFillRuns,
  computeQuestionBankThroughputEstimate,
  questionBankBatchChunkSize,
  questionBankEffectiveBatchChunkSize,
  questionBankMaxConcurrentBatches,
  questionBankMaxEnqueuedTokens,
  questionBankTargetPerCell,
  recordQuestionBankLimitError,
  resetQuestionBankLimitBackoff,
  resetQuestionBankTuningClock,
  resetFailedAgentForRetry,
  resumeFillRun,
  revertAgentSubmittedRequests,
  startQuestionBankFillRun,
  updateAgent,
} from "../lib/question-bank.js";
import {
  canSubmitNewBatch,
  findActiveBatchAgent,
  selectAgentForPollCycle,
  selectAgentsForPollCycle,
  shouldRetryFailedAgent,
  shouldRunBatchSubmitThisCycle,
  shouldRunSyncFillThisCycle,
} from "../lib/question-bank-worker.js";
import {
  questionBankFillMode,
  questionBankFillModeLabel,
  questionBankSyncConcurrency,
  questionBankSyncMaxConcurrency,
} from "../lib/question-bank.js";
import { isEnqueuedTokenLimitError } from "../lib/question-bank-fill.js";
import { hashQuestionContent, parseGeneratedQuestionFromResponse } from "../lib/question-bank-ingest.js";

test("enumerateCurriculumCells covers all year levels", () => {
  const cells = enumerateCurriculumCells();
  assert.ok(cells.length >= 400);
  const years = new Set(cells.map((cell) => cell.yearLevel));
  assert.equal(years.size, 6);
  assert.ok(years.has("Year 7"));
  assert.ok(years.has("Year 12"));
});

test("assignDifficultySlots follows core-heavy distribution", () => {
  const slots = assignDifficultySlots(10);
  assert.equal(slots.length, 10);
  const core = slots.filter((slot) => slot === "core").length;
  const extension = slots.filter((slot) => slot === "extension").length;
  assert.ok(core >= 6);
  assert.ok(extension >= 1);
});

test("agentShardForYearLevel uses year label", () => {
  assert.equal(agentShardForYearLevel("Year 9"), "Year 9");
});

test("getQuestionBankStatusPayload returns totals shape", () => {
  const payload = getQuestionBankStatusPayload();
  assert.ok(payload.totals);
  assert.ok(Array.isArray(payload.breakdown));
  assert.ok(Array.isArray(payload.agents));
  assert.equal(typeof payload.totals.published, "number");
  assert.equal(typeof payload.totals.targetTotal, "number");
});

test("questionBankTargetPerCell defaults sanely", () => {
  const previous = process.env.QUESTION_BANK_TARGET_PER_CELL;
  delete process.env.QUESTION_BANK_TARGET_PER_CELL;
  assert.equal(questionBankTargetPerCell(), 60);
  if (previous !== undefined) {
    process.env.QUESTION_BANK_TARGET_PER_CELL = previous;
  }
});

test("questionBankBatchChunkSize defaults to 100", () => {
  const previous = process.env.QUESTION_BANK_BATCH_CHUNK_SIZE;
  delete process.env.QUESTION_BANK_BATCH_CHUNK_SIZE;
  assert.equal(questionBankBatchChunkSize(), 100);
  if (previous !== undefined) {
    process.env.QUESTION_BANK_BATCH_CHUNK_SIZE = previous;
  } else {
    delete process.env.QUESTION_BANK_BATCH_CHUNK_SIZE;
  }
});

test("questionBankMaxConcurrentBatches defaults to 2", () => {
  const previous = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  assert.equal(questionBankMaxConcurrentBatches(), 2);
  if (previous !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previous;
  }
});

test("estimateBatchEnqueuedTokens uses conservative per-question estimate", () => {
  resetObservedBatchTokenEstimate();
  assert.equal(estimateBatchEnqueuedTokens(100), 100 * 3000);
  assert.equal(estimateBatchEnqueuedTokens(150), 450_000);
});

test("recordObservedBatchTokenUsage lowers per-question estimate", () => {
  resetObservedBatchTokenEstimate();
  assert.equal(estimatedTokensPerQuestion(), 3000);
  recordObservedBatchTokenUsage(100, 180_000);
  assert.ok(estimatedTokensPerQuestion() < 3000);
  assert.equal(estimateBatchEnqueuedTokens(200), 200 * estimatedTokensPerQuestion());
});

test("dynamic concurrency boosts third slot under token headroom", () => {
  resetQuestionBankLimitBackoff();
  resetObservedBatchTokenEstimate();
  const previousMax = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  const previousMin = process.env.QUESTION_BANK_MIN_CONCURRENT_BATCHES;
  const previousDynamic = process.env.QUESTION_BANK_DYNAMIC_CONCURRENCY;
  const previousTokens = process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS;

  process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = "3";
  process.env.QUESTION_BANK_MIN_CONCURRENT_BATCHES = "2";
  process.env.QUESTION_BANK_DYNAMIC_CONCURRENCY = "true";
  process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS = "1900000";

  const roomy = evaluateBatchSubmitCapacity({
    openAiQuota: { inProgress: [{ id: "batch_a" }, { id: "batch_b" }] },
  });
  assert.equal(roomy.maxConcurrent, 3);
  assert.ok(isDynamicConcurrencyBoosted({ tokenUsage: roomy }));

  const tight = evaluateBatchSubmitCapacity({
    openAiQuota: {
      inProgress: Array.from({ length: 5 }, (_, index) => ({ id: `batch_${index}` })),
    },
  });
  assert.equal(tight.maxConcurrent, 2);

  recordQuestionBankLimitError();
  assert.ok(hadLimitErrorInLastHour());
  const afterError = evaluateBatchSubmitCapacity({
    openAiQuota: { inProgress: [{ id: "batch_a" }] },
  });
  assert.equal(afterError.maxConcurrent, 1);
  assert.equal(questionBankMinConcurrentBatches(), 2);

  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previousMax;
  } else {
    delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  }
  if (previousMin !== undefined) {
    process.env.QUESTION_BANK_MIN_CONCURRENT_BATCHES = previousMin;
  } else {
    delete process.env.QUESTION_BANK_MIN_CONCURRENT_BATCHES;
  }
  if (previousDynamic !== undefined) {
    process.env.QUESTION_BANK_DYNAMIC_CONCURRENCY = previousDynamic;
  } else {
    delete process.env.QUESTION_BANK_DYNAMIC_CONCURRENCY;
  }
  if (previousTokens !== undefined) {
    process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS = previousTokens;
  } else {
    delete process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS;
  }
  resetQuestionBankLimitBackoff();
});

test("evaluateBatchSubmitCapacity allows parallel batches under token budget", () => {
  resetQuestionBankLimitBackoff();
  const previousMax = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  const previousTokens = process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS;
  process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = "2";
  process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS = "1800000";

  const capacity = evaluateBatchSubmitCapacity({
    openAiQuota: { inProgress: [{ id: "batch_a" }] },
  });
  assert.equal(capacity.canSubmitByCount, true);
  assert.equal(capacity.slotsAvailable, 2);
  assert.ok(capacity.enqueuedTokens > 0);
  assert.ok(
    capacity.enqueuedTokens + capacity.nextBatchTokens <= questionBankMaxEnqueuedTokens(),
  );

  const full = evaluateBatchSubmitCapacity({
    openAiQuota: {
      inProgress: [
        { id: "batch_a" },
        { id: "batch_b" },
        { id: "batch_c" },
        { id: "batch_d" },
        { id: "batch_e" },
        { id: "batch_f" },
      ],
    },
  });
  assert.equal(full.canSubmitByTokens, false);
  assert.equal(full.canSubmit, false);

  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previousMax;
  } else {
    delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  }
  if (previousTokens !== undefined) {
    process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS = previousTokens;
  } else {
    delete process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS;
  }
});

test("canSubmitNewBatch respects token budget from OpenAI in-flight batches", () => {
  resetQuestionBankLimitBackoff();
  const previousMax = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  const previousTokens = process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS;
  process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = "3";
  process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS = "600000";

  const overBudget = {
    openAiQuota: {
      inProgress: [{ id: "x" }, { id: "y" }],
    },
  };
  assert.equal(canSubmitNewBatch(overBudget), false);

  process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS = "1800000";
  assert.equal(canSubmitNewBatch(overBudget), true);

  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previousMax;
  } else {
    delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  }
  if (previousTokens !== undefined) {
    process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS = previousTokens;
  } else {
    delete process.env.QUESTION_BANK_MAX_ENQUEUED_TOKENS;
  }
});

test("questionBankEffectiveBatchChunkSize stays at base until adaptive stable window", () => {
  const prevChunk = process.env.QUESTION_BANK_BATCH_CHUNK_SIZE;
  const prevAdaptive = process.env.QUESTION_BANK_ADAPTIVE_CHUNK;
  const prevStable = process.env.QUESTION_BANK_ADAPTIVE_STABLE_MS;
  const prevMax = process.env.QUESTION_BANK_ADAPTIVE_CHUNK_MAX;

  process.env.QUESTION_BANK_BATCH_CHUNK_SIZE = "150";
  process.env.QUESTION_BANK_ADAPTIVE_CHUNK = "true";
  process.env.QUESTION_BANK_ADAPTIVE_CHUNK_MAX = "200";
  process.env.QUESTION_BANK_ADAPTIVE_STABLE_MS = "3600000";
  resetQuestionBankTuningClock();

  assert.equal(questionBankEffectiveBatchChunkSize(), 150);

  recordQuestionBankLimitError();
  assert.equal(questionBankEffectiveBatchChunkSize(), 150);

  if (prevChunk !== undefined) {
    process.env.QUESTION_BANK_BATCH_CHUNK_SIZE = prevChunk;
  } else {
    delete process.env.QUESTION_BANK_BATCH_CHUNK_SIZE;
  }
  if (prevAdaptive !== undefined) {
    process.env.QUESTION_BANK_ADAPTIVE_CHUNK = prevAdaptive;
  } else {
    delete process.env.QUESTION_BANK_ADAPTIVE_CHUNK;
  }
  if (prevStable !== undefined) {
    process.env.QUESTION_BANK_ADAPTIVE_STABLE_MS = prevStable;
  } else {
    delete process.env.QUESTION_BANK_ADAPTIVE_STABLE_MS;
  }
  if (prevMax !== undefined) {
    process.env.QUESTION_BANK_ADAPTIVE_CHUNK_MAX = prevMax;
  } else {
    delete process.env.QUESTION_BANK_ADAPTIVE_CHUNK_MAX;
  }
});

test("computeQuestionBankThroughputEstimate returns positive ETA for remaining work", () => {
  const totals = {
    published: 100,
    targetTotal: 1000,
    runPublished: 50,
    displayRun: { started_at: new Date(Date.now() - 3_600_000).toISOString().replace("T", " ").slice(0, 19) },
  };
  const estimate = computeQuestionBankThroughputEstimate(totals);
  assert.equal(estimate.remaining, 900);
  assert.ok(estimate.publishedPerHour > 0);
  assert.ok(estimate.estimatedHours > 0);
});

test("questionBankMaxConcurrentBatches respects env up to cap", () => {
  const previous = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = "6";
  assert.equal(questionBankMaxConcurrentBatches(), 6);
  if (previous !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previous;
  } else {
    delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  }
});

test("questionBankFillMode defaults to sync", () => {
  const previous = process.env.QUESTION_BANK_FILL_MODE;
  delete process.env.QUESTION_BANK_FILL_MODE;
  assert.equal(questionBankFillMode(), "sync");
  assert.equal(questionBankFillModeLabel(), "Sync API");
  if (previous !== undefined) {
    process.env.QUESTION_BANK_FILL_MODE = previous;
  }
});

test("questionBankSyncConcurrency defaults to 3", () => {
  const previous = process.env.QUESTION_BANK_SYNC_CONCURRENCY;
  const previousMax = process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY;
  delete process.env.QUESTION_BANK_SYNC_CONCURRENCY;
  delete process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY;
  assert.equal(questionBankSyncConcurrency(), 3);
  assert.equal(questionBankSyncMaxConcurrency(), 15);
  if (previous !== undefined) {
    process.env.QUESTION_BANK_SYNC_CONCURRENCY = previous;
  } else {
    delete process.env.QUESTION_BANK_SYNC_CONCURRENCY;
  }
  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY = previousMax;
  } else {
    delete process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY;
  }
});

test("questionBankSyncConcurrency respects configured value up to max cap", () => {
  const previous = process.env.QUESTION_BANK_SYNC_CONCURRENCY;
  const previousMax = process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY;
  process.env.QUESTION_BANK_SYNC_CONCURRENCY = "8";
  process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY = "15";
  assert.equal(questionBankSyncConcurrency(), 8);
  process.env.QUESTION_BANK_SYNC_CONCURRENCY = "20";
  assert.equal(questionBankSyncConcurrency(), 15);
  if (previous !== undefined) {
    process.env.QUESTION_BANK_SYNC_CONCURRENCY = previous;
  } else {
    delete process.env.QUESTION_BANK_SYNC_CONCURRENCY;
  }
  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY = previousMax;
  } else {
    delete process.env.QUESTION_BANK_SYNC_MAX_CONCURRENCY;
  }
});

test("shouldRunBatchSubmitThisCycle respects fill mode", () => {
  assert.equal(shouldRunBatchSubmitThisCycle("batch"), true);
  assert.equal(shouldRunBatchSubmitThisCycle("hybrid"), true);
  assert.equal(shouldRunBatchSubmitThisCycle("sync"), false);
});

test("shouldRunSyncFillThisCycle respects fill mode and batch slots", () => {
  assert.equal(shouldRunSyncFillThisCycle({ fillMode: "sync" }), true);
  assert.equal(shouldRunSyncFillThisCycle({ fillMode: "batch" }), false);
  assert.equal(
    shouldRunSyncFillThisCycle({
      fillMode: "hybrid",
      batchSelection: { agents: [{ agent: { id: 1 } }], reason: "submit" },
    }),
    false,
  );
  assert.equal(
    shouldRunSyncFillThisCycle({
      fillMode: "hybrid",
      batchSelection: { agents: [], reason: "slots_full" },
    }),
    true,
  );
  assert.equal(
    shouldRunSyncFillThisCycle({
      fillMode: "hybrid",
      batchSelection: { agents: [], reason: "none" },
    }),
    true,
  );
});

test("selectAgentsForPollCycle skips batch submit in sync mode", () => {
  const previousMode = process.env.QUESTION_BANK_FILL_MODE;
  process.env.QUESTION_BANK_FILL_MODE = "sync";
  const selection = selectAgentsForPollCycle([], {});
  assert.equal(selection.agents.length, 0);
  assert.equal(selection.reason, "sync_mode");
  if (previousMode !== undefined) {
    process.env.QUESTION_BANK_FILL_MODE = previousMode;
  } else {
    delete process.env.QUESTION_BANK_FILL_MODE;
  }
});

test("isEnqueuedTokenLimitError detects OpenAI limit message", () => {
  assert.equal(
    isEnqueuedTokenLimitError(
      "Enqueued token limit reached for gpt-4.1-mini in organization org-abc.",
    ),
    true,
  );
  assert.equal(isEnqueuedTokenLimitError("Batch submission failed."), false);
});

function resetAgentsToIdle(agents) {
  for (const agent of agents) {
    updateAgent(agent.id, {
      status: "idle",
      openai_batch_id: null,
      openai_input_file_id: null,
      openai_output_file_id: null,
      openai_error_file_id: null,
      last_error: null,
    });
  }
}

describe("question bank fill run lifecycle", { concurrency: 1 }, () => {
test("startQuestionBankFillRun resumes paused run instead of creating duplicate", () => {
  pauseAllFillRuns();

  const first = startQuestionBankFillRun();
  assert.equal(first.alreadyRunning, false);
  assert.equal(first.resumed, false);
  assert.ok(first.requestsCreated > 0);
  const runId = first.run.id;

  pauseActiveFillRun();

  const second = startQuestionBankFillRun();
  assert.equal(second.alreadyRunning, false);
  assert.equal(second.resumed, true);
  assert.equal(second.run.id, runId);
  assert.equal(second.requestsCreated, 0);
  assert.equal(second.run.status, "running");

  pauseActiveFillRun();
});

test("startQuestionBankFillRun returns alreadyRunning for active run", () => {
  pauseAllFillRuns();
  const first = startQuestionBankFillRun();
  const second = startQuestionBankFillRun();
  assert.equal(second.alreadyRunning, true);
  assert.equal(second.resumed, false);
  assert.equal(second.run.id, first.run.id);
  pauseActiveFillRun();
});

test("getPausedFillRunWithPending prefers run with more submitted progress", async () => {
  const dbModule = await import("../lib/db.js");
  const db = dbModule.getDb();
  pauseAllFillRuns();

  const first = startQuestionBankFillRun();
  pauseActiveFillRun();

  const second = startQuestionBankFillRun();
  pauseActiveFillRun();

  const submittedId = db
    .prepare(
      "SELECT id FROM question_bank_requests WHERE run_id = ? AND status = 'pending' LIMIT 1",
    )
    .get(first.run.id)?.id;
  db.prepare("UPDATE question_bank_requests SET status = 'submitted' WHERE id = ?").run(submittedId);

  const pick = getPausedFillRunWithPending();
  assert.equal(pick.id, first.run.id);

  pauseActiveFillRun();
});

test("resumeFillRun normalizes stuck submitting agents", async () => {
  const dbModule = await import("../lib/db.js");
  const db = dbModule.getDb();
  pauseAllFillRuns();

  const { run, agents } = startQuestionBankFillRun();
  pauseActiveFillRun();

  updateAgent(agents[0].id, { status: "submitting", openai_batch_id: null });

  const resumed = resumeFillRun(run.id);
  assert.equal(resumed.status, "running");

  const agent = db.prepare("SELECT status FROM question_bank_agents WHERE id = ?").get(agents[0].id);
  assert.equal(agent.status, "idle");

  pauseActiveFillRun();
});

test("normalizeOrphanedBatchAgents demotes active agents on paused runs only", () => {
  pauseAllFillRuns();
  const { run, agents } = startQuestionBankFillRun();
  resetAgentsToIdle(agents);

  updateAgent(agents[0].id, { status: "batch_active", openai_batch_id: "batch_keep" });
  updateAgent(agents[1].id, { status: "ingesting", openai_batch_id: "batch_parallel" });
  assert.equal(countActiveBatchAgents(), 2);

  const demoted = normalizeOrphanedBatchAgents();
  assert.equal(demoted, 0);
  assert.equal(countActiveBatchAgents(), 2);

  pauseActiveFillRun();
  const demotedAfterPause = normalizeOrphanedBatchAgents();
  assert.equal(demotedAfterPause, 2);
  assert.equal(countActiveBatchAgents(), 0);
});

test("canSubmitNewBatch allows second batch when under concurrent cap", () => {
  resetQuestionBankLimitBackoff();
  pauseAllFillRuns();

  const previousMax = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = "2";

  const { agents } = startQuestionBankFillRun();
  resetAgentsToIdle(agents);
  assert.equal(countActiveBatchAgents(), 0);
  assert.equal(canSubmitNewBatch(), true);

  updateAgent(agents[0].id, { status: "batch_active", openai_batch_id: "batch_a", requests_in_batch: 150 });
  assert.equal(countActiveBatchAgents(), 1);
  assert.equal(canSubmitNewBatch(), true);

  updateAgent(agents[1].id, { status: "batch_active", openai_batch_id: "batch_b", requests_in_batch: 150 });
  assert.equal(countActiveBatchAgents(), 2);
  assert.equal(canSubmitNewBatch(), false);

  updateAgent(agents[0].id, { status: "idle", openai_batch_id: null });
  updateAgent(agents[1].id, { status: "idle", openai_batch_id: null });
  assert.equal(canSubmitNewBatch(), true);

  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previousMax;
  } else {
    delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  }

  pauseActiveFillRun();
});

test("selectAgentsForPollCycle picks idle agent while another batch is active when slots remain", () => {
  resetQuestionBankLimitBackoff();
  pauseAllFillRuns();
  const previousMode = process.env.QUESTION_BANK_FILL_MODE;
  const previousMax = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  process.env.QUESTION_BANK_FILL_MODE = "batch";
  process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = "2";

  const { agents } = startQuestionBankFillRun();
  resetAgentsToIdle(agents);

  updateAgent(agents[0].id, { status: "batch_active", openai_batch_id: "batch_a", requests_in_batch: 150 });
  const freshAgents = getFillRunAgents(agents[0].run_id);
  const selection = selectAgentsForPollCycle(freshAgents);
  assert.equal(selection.agents.length, 1);
  assert.equal(selection.agents[0].reason, "submit_idle");
  assert.notEqual(selection.agents[0].agent.id, agents[0].id);

  updateAgent(agents[1].id, { status: "ingesting", openai_batch_id: "batch_b", requests_in_batch: 150 });
  const full = selectAgentsForPollCycle(getFillRunAgents(agents[0].run_id));
  assert.equal(full.agents.length, 0);
  assert.equal(full.reason, "slots_full");

  resetAgentsToIdle(agents);
  if (previousMode !== undefined) {
    process.env.QUESTION_BANK_FILL_MODE = previousMode;
  } else {
    delete process.env.QUESTION_BANK_FILL_MODE;
  }
  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previousMax;
  } else {
    delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  }
  pauseActiveFillRun();
});

test("selectAgentForPollCycle picks one idle agent when slot is free", () => {
  pauseAllFillRuns();
  const previousMode = process.env.QUESTION_BANK_FILL_MODE;
  process.env.QUESTION_BANK_FILL_MODE = "batch";
  const { agents } = startQuestionBankFillRun();
  resetAgentsToIdle(agents);

  const freshAgents = getFillRunAgents(agents[0].run_id);
  const selection = selectAgentForPollCycle(freshAgents);
  assert.ok(selection.agent);
  assert.equal(selection.reason, "submit_idle");
  assert.equal(findActiveBatchAgent(freshAgents), null);

  if (previousMode !== undefined) {
    process.env.QUESTION_BANK_FILL_MODE = previousMode;
  } else {
    delete process.env.QUESTION_BANK_FILL_MODE;
  }
  pauseActiveFillRun();
});

test("deriveAgentDisplayStatus shows waiting_for_slot for idle agents with pending work", async () => {
  const dbModule = await import("../lib/db.js");
  const db = dbModule.getDb();
  pauseAllFillRuns();
  const previousMode = process.env.QUESTION_BANK_FILL_MODE;
  const previousMax = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  process.env.QUESTION_BANK_FILL_MODE = "batch";
  process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = "2";

  const { run, agents } = startQuestionBankFillRun();
  resetAgentsToIdle(agents);

  updateAgent(agents[0].id, { status: "batch_active", openai_batch_id: "batch_live" });
  updateAgent(agents[1].id, { status: "batch_active", openai_batch_id: "batch_live_b" });

  const pending = db
    .prepare(
      "SELECT COUNT(*) AS count FROM question_bank_requests WHERE run_id = ? AND agent_shard = ? AND status = 'pending'",
    )
    .get(run.id, agents[2].shard_key);
  assert.ok(Number(pending.count) > 0);

  const freshAgents = getFillRunAgents(run.id);
  const activeAgent = freshAgents.find((agent) => agent.id === agents[0].id);
  const waitingAgent = freshAgents.find((agent) => agent.id === agents[2].id);
  assert.equal(deriveAgentDisplayStatus(waitingAgent, run.id), "waiting_for_slot");
  assert.equal(deriveAgentDisplayStatus(activeAgent, run.id), "batch_active");

  if (previousMode !== undefined) {
    process.env.QUESTION_BANK_FILL_MODE = previousMode;
  } else {
    delete process.env.QUESTION_BANK_FILL_MODE;
  }
  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previousMax;
  } else {
    delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  }

  pauseActiveFillRun();
});

test("getQuestionBankStatusPayload surfaces waiting_for_slot display status", async () => {
  pauseAllFillRuns();
  const previousMode = process.env.QUESTION_BANK_FILL_MODE;
  const previousMax = process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  process.env.QUESTION_BANK_FILL_MODE = "batch";
  process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = "2";

  const { run, agents } = startQuestionBankFillRun();
  resetAgentsToIdle(agents);
  updateAgent(agents[0].id, { status: "batch_active", openai_batch_id: "batch_live" });
  updateAgent(agents[1].id, { status: "batch_active", openai_batch_id: "batch_live_b" });

  const payload = getQuestionBankStatusPayload();
  const waiting = payload.agents.find((agent) => agent.yearLevel === agents[2].year_level);
  assert.equal(waiting?.status, "waiting_for_slot");
  assert.ok(payload.tokenBudget);
  assert.equal(typeof payload.slotsUsed, "number");

  if (previousMode !== undefined) {
    process.env.QUESTION_BANK_FILL_MODE = previousMode;
  } else {
    delete process.env.QUESTION_BANK_FILL_MODE;
  }
  if (previousMax !== undefined) {
    process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES = previousMax;
  } else {
    delete process.env.QUESTION_BANK_MAX_CONCURRENT_BATCHES;
  }

  pauseActiveFillRun();
});

test("getQuestionBankStatusPayload includes fill mode", () => {
  const previousMode = process.env.QUESTION_BANK_FILL_MODE;
  process.env.QUESTION_BANK_FILL_MODE = "sync";
  const payload = getQuestionBankStatusPayload();
  assert.equal(payload.fillMode, "sync");
  assert.equal(payload.fillModeLabel, "Sync API");
  assert.equal(payload.syncConcurrency, 3);
  assert.equal(payload.syncMaxConcurrency, 15);
  if (previousMode !== undefined) {
    process.env.QUESTION_BANK_FILL_MODE = previousMode;
  } else {
    delete process.env.QUESTION_BANK_FILL_MODE;
  }
});

test("resetFailedAgentForRetry reverts submitted requests and clears batch state", async () => {
  const dbModule = await import("../lib/db.js");
  const db = dbModule.getDb();
  pauseActiveFillRun();
  const { run, agents } = startQuestionBankFillRun();
  const agent = agents[0];

  const ids = db
    .prepare(
      "SELECT id FROM question_bank_requests WHERE run_id = ? AND agent_shard = ? AND status = 'pending' LIMIT 3",
    )
    .all(run.id, agent.shard_key)
    .map((row) => row.id);
  for (const id of ids) {
    db.prepare("UPDATE question_bank_requests SET status = 'submitted', batch_id = 'test-batch' WHERE id = ?").run(
      id,
    );
  }

  updateAgent(agent.id, {
    status: "failed",
    openai_batch_id: "batch_test",
    last_error: "Enqueued token limit reached",
    requests_in_batch: 3,
  });

  resetFailedAgentForRetry(agent.id);

  for (const id of ids) {
    const row = db.prepare("SELECT status FROM question_bank_requests WHERE id = ?").get(id);
    assert.equal(row.status, "pending");
  }

  const updated = db.prepare("SELECT * FROM question_bank_agents WHERE id = ?").get(agent.id);
  assert.equal(updated.status, "idle");
  assert.equal(updated.openai_batch_id, null);
  assert.equal(updated.last_error, null);
  pauseActiveFillRun();
});

test("shouldRetryFailedAgent is true when failed agent still has submitted work", async () => {
  const dbModule = await import("../lib/db.js");
  const db = dbModule.getDb();
  pauseActiveFillRun();
  const { run, agents } = startQuestionBankFillRun();
  const agent = agents[0];

  const id = db
    .prepare(
      "SELECT id FROM question_bank_requests WHERE run_id = ? AND agent_shard = ? AND status = 'pending' LIMIT 1",
    )
    .get(run.id, agent.shard_key)?.id;
  db.prepare("UPDATE question_bank_requests SET status = 'submitted' WHERE id = ?").run(id);

  updateAgent(agent.id, {
    status: "failed",
    last_error: "Enqueued token limit reached",
  });

  assert.equal(shouldRetryFailedAgent({ ...agent, status: "failed" }), true);
  pauseActiveFillRun();
});

test("revertAgentSubmittedRequests restores pending status", async () => {
  const dbModule = await import("../lib/db.js");
  const db = dbModule.getDb();
  pauseActiveFillRun();
  const { run, agents } = startQuestionBankFillRun();
  const agent = agents[1];

  const ids = db
    .prepare(
      "SELECT id FROM question_bank_requests WHERE run_id = ? AND agent_shard = ? AND status = 'pending' LIMIT 2",
    )
    .all(run.id, agent.shard_key)
    .map((row) => row.id);
  for (const id of ids) {
    db.prepare("UPDATE question_bank_requests SET status = 'submitted', batch_id = 'tag-1' WHERE id = ?").run(id);
  }

  const changes = revertAgentSubmittedRequests(run.id, agent.shard_key, "tag-1");
  assert.equal(changes, 2);
  pauseActiveFillRun();
});

}); // question bank fill run lifecycle

test("parseGeneratedQuestionFromResponse accepts valid MCQ JSON", () => {
  const body = {
    output_text: JSON.stringify({
      question: "What is $2 + 2$?",
      options: ["$3$", "$4$", "$5$", "$6$"],
      answer: "$4$",
      explanation: "Add the numbers.\nThe answer is $4$.",
    }),
  };
  const parsed = parseGeneratedQuestionFromResponse(body);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.question.options.includes(parsed.question.answer));
  const hash = hashQuestionContent(parsed.question);
  assert.equal(hash.length, 64);
});
