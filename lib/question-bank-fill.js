import {
  createResponsesBatch,
  downloadBatchFile,
  retrieveBatch,
  uploadBatchInputFile,
} from "./openai-batch.js";
import { buildBatchRequestLine } from "./question-bank-prompt.js";
import {
  bumpRunCounters,
  listPendingRequestsForShard,
  getRequestByCustomId,
  insertPublishedQuestion,
  markRequestOutcome,
  maybeCompleteFillRun,
  questionBankEffectiveBatchChunkSize,
  questionBankBatchModel,
  recordObservedBatchTokenUsage,
  revertAgentSubmittedRequests,
  sumTokenUsageFromBatchOutputRows,
  updateAgent,
} from "./question-bank.js";
import { hashQuestionContent, parseGeneratedQuestionFromResponse } from "./question-bank-ingest.js";
import { getDb } from "./db.js";

export function isEnqueuedTokenLimitError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("enqueued token limit");
}

/**
 * @param {object} agent
 */
export async function submitAgentBatch(agent) {
  const chunkSize = questionBankEffectiveBatchChunkSize();
  const pending = listPendingRequestsForShard(agent.run_id, agent.shard_key, chunkSize);
  if (!pending.length) {
    updateAgent(agent.id, { status: "completed" });
    maybeCompleteFillRun(agent.run_id);
    return { submitted: false, reason: "no_pending" };
  }

  const batchTag = `batch-${agent.run_id}-${agent.id}-${Date.now()}`;
  updateAgent(agent.id, { status: "submitting", last_error: null });

  const db = getDb();
  const markBatch = db.prepare(
    `
    UPDATE question_bank_requests
    SET status = 'submitted', batch_id = ?
    WHERE id = ? AND status = 'pending'
  `,
  );

  db.exec("BEGIN");
  try {
    for (const row of pending) {
      markBatch.run(batchTag, row.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const lines = pending.map((row) => JSON.stringify(buildBatchRequestLine(row, questionBankBatchModel())));
  const jsonl = `${lines.join("\n")}\n`;

  try {
    const uploaded = await uploadBatchInputFile(jsonl);
    const created = await createResponsesBatch(uploaded.id);

    updateAgent(agent.id, {
      status: "batch_active",
      openai_batch_id: created.id,
      openai_input_file_id: uploaded.id,
      openai_output_file_id: null,
      openai_error_file_id: null,
      requests_in_batch: pending.length,
      requests_ingested: 0,
      last_error: null,
    });

    return { submitted: true, batchId: created.id, requestCount: pending.length };
  } catch (error) {
    const message = error?.message || "Batch submission failed.";
    updateAgent(agent.id, {
      status: "failed",
      last_error: message,
      openai_batch_id: null,
      openai_input_file_id: null,
      requests_in_batch: 0,
    });

    revertAgentSubmittedRequests(agent.run_id, agent.shard_key, batchTag);

    throw error;
  }
}

/**
 * @param {object} agent
 */
export async function pollAndIngestAgentBatch(agent) {
  if (!agent.openai_batch_id) {
    return { polled: false };
  }

  const remote = await retrieveBatch(agent.openai_batch_id);
  const status = String(remote.status || "");

  if (status === "failed" || status === "expired" || status === "cancelled") {
    const message = remote?.errors?.data?.[0]?.message || `Batch ${status}`;
    revertAgentSubmittedRequests(agent.run_id, agent.shard_key);
    updateAgent(agent.id, {
      status: "failed",
      last_error: message,
      openai_batch_id: null,
      openai_input_file_id: null,
      openai_output_file_id: null,
      openai_error_file_id: null,
      requests_in_batch: 0,
    });
    return { polled: true, status, failed: true };
  }

  if (status !== "completed") {
    updateAgent(agent.id, { status: "batch_active" });
    return { polled: true, status, completed: false };
  }

  updateAgent(agent.id, { status: "ingesting" });

  let published = 0;
  let rejected = 0;

  if (remote.output_file_id) {
    const outputText = await downloadBatchFile(remote.output_file_id);
    const lines = outputText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const outputRows = [];

    for (const line of lines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      outputRows.push(row);

      const customId = row.custom_id;
      const requestRow = getRequestByCustomId(customId);
      if (!requestRow) {
        continue;
      }

      const statusCode = Number(row.response?.status_code || 0);
      if (statusCode !== 200) {
        markRequestOutcome(requestRow.id, {
          status: "rejected",
          rejectReason: row.error?.message || `http_${statusCode}`,
        });
        rejected += 1;
        continue;
      }

      const parsed = parseGeneratedQuestionFromResponse(row.response?.body || {});
      if (!parsed.ok) {
        markRequestOutcome(requestRow.id, {
          status: "rejected",
          rejectReason: parsed.reason,
        });
        rejected += 1;
        continue;
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
        published += 1;
      } else {
        markRequestOutcome(requestRow.id, {
          status: "rejected",
          rejectReason: "duplicate_hash",
        });
        rejected += 1;
      }
    }

    const measuredTokens =
      sumTokenUsageFromBatchOutputRows(outputRows) ||
      Number(remote?.usage?.total_tokens || 0) ||
      (Number(remote?.usage?.input_tokens || 0) + Number(remote?.usage?.output_tokens || 0));
    if (measuredTokens > 0) {
      recordObservedBatchTokenUsage(outputRows.length || Number(agent.requests_in_batch || 0), measuredTokens);
    }
  }

  if (remote.error_file_id) {
    try {
      const errorText = await downloadBatchFile(remote.error_file_id);
      const lines = errorText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        const row = JSON.parse(line);
        const requestRow = getRequestByCustomId(row.custom_id);
        if (!requestRow || requestRow.status === "published") {
          continue;
        }
        markRequestOutcome(requestRow.id, {
          status: "rejected",
          rejectReason: row.error?.message || "batch_line_error",
        });
        rejected += 1;
      }
    } catch {
      // Non-fatal — output file is primary.
    }
  }

  bumpRunCounters(agent.run_id, { published, rejected });

  const pendingLeft = listPendingRequestsForShard(agent.run_id, agent.shard_key, 1).length;

  updateAgent(agent.id, {
    status: pendingLeft > 0 ? "idle" : "completed",
    openai_batch_id: null,
    openai_output_file_id: remote.output_file_id || null,
    openai_error_file_id: remote.error_file_id || null,
    requests_ingested: Number(agent.requests_ingested || 0) + published + rejected,
    last_error: null,
  });

  maybeCompleteFillRun(agent.run_id);

  return { polled: true, status, completed: true, published, rejected };
}
