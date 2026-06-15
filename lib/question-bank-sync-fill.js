import { buildOpenAiFailure, fetchOpenAiWithRetry, resolveOpenAiRetryOptions } from "./openai-errors.js";
import { buildQuestionBankBatchPrompt } from "./question-bank-prompt.js";
import {
  agentHasPendingWork,
  bumpRunCounters,
  insertPublishedQuestion,
  listPendingRequestsForShard,
  markRequestOutcome,
  maybeCompleteFillRun,
  questionBankBatchModel,
  questionBankSyncConcurrency,
  updateAgent,
} from "./question-bank.js";
import { hashQuestionContent, parseGeneratedQuestionFromResponse } from "./question-bank-ingest.js";

/**
 * @param {object} requestRow
 */
export async function requestSingleQuestion(requestRow) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const prompt = buildQuestionBankBatchPrompt({
    yearLevel: requestRow.year_level,
    subject: requestRow.subject,
    focus: requestRow.focus_label,
    difficulty: requestRow.difficulty,
    questionStyle: requestRow.question_style,
  });

  const body = {
    model: questionBankBatchModel(),
    input: prompt,
    temperature: 0.35,
    max_output_tokens: Number(process.env.QUESTION_BANK_MAX_OUTPUT_TOKENS || 1200),
  };

  const endpoint = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/responses";
  const response = await fetchOpenAiWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    resolveOpenAiRetryOptions(),
  );

  if (!response.ok) {
    const failure = buildOpenAiFailure(
      response.status,
      response.errorText,
      response.statusText,
    );
    throw new Error(failure.message || `OpenAI sync request failed (${response.status}).`);
  }

  const payload = await response.json();
  return parseGeneratedQuestionFromResponse(payload);
}

/**
 * @param {object} requestRow
 * @param {object} agent
 */
export async function ingestSyncQuestion(requestRow, agent) {
  const parsed = await requestSingleQuestion(requestRow);

  if (!parsed.ok) {
    markRequestOutcome(requestRow.id, {
      status: "rejected",
      rejectReason: parsed.reason,
    });
    return { published: 0, rejected: 1, error: null };
  }

  const contentHash = hashQuestionContent(parsed.question);
  const inserted = insertPublishedQuestion({
    requestRow,
    question: parsed.question,
    contentHash,
    fillRunId: agent.run_id,
  });

  if (inserted) {
    markRequestOutcome(requestRow.id, { status: "published" });
    return { published: 1, rejected: 0, error: null };
  }

  markRequestOutcome(requestRow.id, {
    status: "rejected",
    rejectReason: "duplicate_hash",
  });
  return { published: 0, rejected: 1, error: null };
}

/**
 * @param {object[]} agents
 * @param {number} limit
 */
export function collectSyncPendingRequests(agents, limit) {
  const eligible = agents.filter(
    (agent) =>
      (agent.status === "idle" || agent.status === "failed") &&
      agentHasPendingWork(agent.run_id, agent.shard_key),
  );

  const items = [];
  const cursors = new Map(eligible.map((agent) => [agent.id, 0]));

  while (items.length < limit) {
    let progress = false;
    for (const agent of eligible) {
      if (items.length >= limit) {
        break;
      }

      const cursor = cursors.get(agent.id) || 0;
      const rows = listPendingRequestsForShard(agent.run_id, agent.shard_key, cursor + 1);
      const row = rows[cursor];
      if (!row) {
        continue;
      }

      items.push({ agent, requestRow: row });
      cursors.set(agent.id, cursor + 1);
      progress = true;
    }

    if (!progress) {
      break;
    }
  }

  return items;
}

async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  const results = [];

  async function runNext() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(runners);
  return results;
}

/**
 * Process pending requests via sync /v1/responses for eligible agents.
 * @param {object[]} agents
 * @param {{ maxRequests?: number }} [options]
 */
export async function processSyncFillForAgents(agents, options = {}) {
  const concurrency = questionBankSyncConcurrency();
  const maxRequests = options.maxRequests ?? concurrency;
  const work = collectSyncPendingRequests(agents, maxRequests);

  if (!work.length) {
    return { processed: 0, published: 0, rejected: 0, limitError: false };
  }

  let published = 0;
  let rejected = 0;
  let limitError = false;
  const runTotals = new Map();

  function bumpRun(runId, delta) {
    const current = runTotals.get(runId) || { published: 0, rejected: 0 };
    current.published += delta.published;
    current.rejected += delta.rejected;
    runTotals.set(runId, current);
  }

  await runWithConcurrency(work, concurrency, async ({ agent, requestRow }) => {
    try {
      const outcome = await ingestSyncQuestion(requestRow, agent);
      published += outcome.published;
      rejected += outcome.rejected;
      bumpRun(agent.run_id, outcome);
    } catch (error) {
      const message = error?.message || "Sync request failed.";
      if (String(message).toLowerCase().includes("enqueued token limit")) {
        limitError = true;
      }
      markRequestOutcome(requestRow.id, {
        status: "rejected",
        rejectReason: message,
      });
      rejected += 1;
      bumpRun(agent.run_id, { published: 0, rejected: 1 });
    }
  });

  const touchedAgents = new Set(work.map((item) => item.agent.id));
  for (const agentId of touchedAgents) {
    const agent = agents.find((row) => row.id === agentId);
    if (!agent) {
      continue;
    }

    if (!agentHasPendingWork(agent.run_id, agent.shard_key)) {
      updateAgent(agentId, { status: "completed", last_error: null });
    }
  }

  for (const [runId, totals] of runTotals) {
    bumpRunCounters(runId, totals);
    maybeCompleteFillRun(runId);
  }

  return {
    processed: work.length,
    published,
    rejected,
    limitError,
  };
}
