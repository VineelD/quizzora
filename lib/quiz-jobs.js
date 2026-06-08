import { generateQuiz } from "./ai.js";
import { getOrCreateClassForYearLevel, getDb, getUserById, insertGeneratedQuiz } from "./db.js";
import {
  prepareQuizForAssignment,
  validateQuizStudentReadability,
} from "./quiz-quality.js";

export { parseQuizRequestFromBody } from "./quiz-request.js";

function mapJobRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    familyId: row.family_id != null ? Number(row.family_id) : null,
    schoolId: row.school_id != null ? Number(row.school_id) : null,
    status: row.status,
    payload: JSON.parse(row.payload_json || "{}"),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    errorMessage: row.error_message || null,
    progressMessage: row.progress_message || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
  };
}

export function enqueueQuizGenerationJob({ userId, payload }) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const db = getDb();
  const result = db
    .prepare(
      `
      INSERT INTO quiz_generation_jobs (
        user_id, family_id, school_id, status, payload_json, progress_message
      )
      VALUES (?, ?, ?, 'queued', ?, ?)
    `,
    )
    .run(
      userId,
      user.family_id ?? null,
      user.school_id ?? null,
      JSON.stringify(payload),
      "Queued",
    );

  return getQuizGenerationJob(Number(result.lastInsertRowid));
}

export function getQuizGenerationJob(jobId) {
  const row = getDb()
    .prepare("SELECT * FROM quiz_generation_jobs WHERE id = ?")
    .get(Number(jobId));
  return mapJobRow(row);
}

export function getQuizGenerationJobForUser(jobId, userId) {
  const job = getQuizGenerationJob(jobId);
  if (!job || Number(job.userId) !== Number(userId)) {
    return null;
  }
  return job;
}

export function updateQuizGenerationJob(jobId, updates) {
  const fields = [];
  const values = [];

  if (updates.status != null) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.progressMessage !== undefined) {
    fields.push("progress_message = ?");
    values.push(updates.progressMessage);
  }
  if (updates.result !== undefined) {
    fields.push("result_json = ?");
    values.push(updates.result == null ? null : JSON.stringify(updates.result));
  }
  if (updates.errorMessage !== undefined) {
    fields.push("error_message = ?");
    values.push(updates.errorMessage);
  }
  if (updates.startedAt !== undefined) {
    fields.push("started_at = ?");
    values.push(updates.startedAt);
  }
  if (updates.completedAt !== undefined) {
    fields.push("completed_at = ?");
    values.push(updates.completedAt);
  }

  if (fields.length === 0) {
    return getQuizGenerationJob(jobId);
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(Number(jobId));

  getDb()
    .prepare(`UPDATE quiz_generation_jobs SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);

  return getQuizGenerationJob(jobId);
}

export function claimNextQuizJob() {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare(
        `
        SELECT id
        FROM quiz_generation_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
      `,
      )
      .get();

    if (!row) {
      db.exec("ROLLBACK");
      return null;
    }

    const result = db
      .prepare(
        `
        UPDATE quiz_generation_jobs
        SET
          status = 'processing',
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP,
          progress_message = 'Generating quiz content...'
        WHERE id = ? AND status = 'queued'
      `,
      )
      .run(row.id);

    if (result.changes === 0) {
      db.exec("ROLLBACK");
      return null;
    }

    db.exec("COMMIT");
    return getQuizGenerationJob(row.id);
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

export async function processQuizGenerationJob(job) {
  const quizRequest = job.payload;

  updateQuizGenerationJob(job.id, {
    progressMessage: "Generating questions and diagrams...",
  });

  let generated;
  try {
    generated = await generateQuiz(quizRequest, {
      onProgress: (progressMessage) =>
        updateQuizGenerationJob(job.id, { progressMessage }),
    });
  } catch (error) {
    updateQuizGenerationJob(job.id, {
      status: "failed",
      errorMessage: error.message || "Quiz generation failed.",
      progressMessage: null,
      completedAt: new Date().toISOString(),
    });
    return getQuizGenerationJob(job.id);
  }

  updateQuizGenerationJob(job.id, {
    progressMessage: "Checking readability before assign...",
  });

  const readability = validateQuizStudentReadability(generated.quiz, {
    focus: quizRequest.focus,
    subject: quizRequest.subject,
  });

  if (!readability.valid) {
    const summary = readability.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => issue.message)
      .slice(0, 4)
      .join(" ");
    updateQuizGenerationJob(job.id, {
      status: "failed",
      errorMessage: summary || "Quiz failed readability checks.",
      progressMessage: null,
      completedAt: new Date().toISOString(),
    });
    return getQuizGenerationJob(job.id);
  }

  generated.quiz = {
    ...generated.quiz,
    questions: readability.questions,
    clarityReport: readability.readabilityReport,
  };

  if (readability.readabilityReport?.needsReview) {
    updateQuizGenerationJob(job.id, {
      status: "review_required",
      result: {
        generated,
        source: generated.source,
        clarityReport: readability.readabilityReport,
        diagramReport: generated.quiz?.diagramReport || generated.diagramReport || null,
      },
      progressMessage: "Review recommended before assigning.",
    });
    return getQuizGenerationJob(job.id);
  }

  let quizForSave;
  try {
    quizForSave = prepareQuizForAssignment(generated.quiz, {
      focus: quizRequest.focus,
      subject: quizRequest.subject,
    });
  } catch (error) {
    updateQuizGenerationJob(job.id, {
      status: "failed",
      errorMessage: error.message || "Quiz failed readability checks.",
      progressMessage: null,
      completedAt: new Date().toISOString(),
    });
    return getQuizGenerationJob(job.id);
  }

  generated.quiz = quizForSave;

  return finalizeQuizGenerationJob(job, generated, quizRequest);
}

function buildQuizTitle(quizRequest) {
  return quizRequest.selectedSubtopics?.length > 1
    ? `${quizRequest.subject}: ${quizRequest.selectedSubtopics.length} subtopics`
    : `${quizRequest.subject}: ${quizRequest.focus}`;
}

async function finalizeQuizGenerationJob(job, generated, quizRequest) {
  const teacherId = job.userId;

  updateQuizGenerationJob(job.id, {
    progressMessage: "Saving and assigning quiz...",
  });

  const title = buildQuizTitle(quizRequest);
  try {
    const saved = insertGeneratedQuiz({
      teacherId,
      yearLevel: quizRequest.yearLevel,
      classId: getOrCreateClassForYearLevel(teacherId, quizRequest.yearLevel),
      title,
      request: quizRequest,
      generated,
    });

    updateQuizGenerationJob(job.id, {
      status: "completed",
      result: {
        quizId: saved.quizId,
        assignmentId: saved.assignmentId,
        source: generated.source,
        clarityReport: generated.quiz?.clarityReport || generated.clarityReport || null,
        diagramReport: generated.quiz?.diagramReport || generated.diagramReport || null,
      },
      progressMessage: "Done",
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    updateQuizGenerationJob(job.id, {
      status: "failed",
      errorMessage: error.message || "Could not save the generated quiz.",
      progressMessage: null,
      completedAt: new Date().toISOString(),
    });
  }

  return getQuizGenerationJob(job.id);
}

export async function assignReviewedQuizJob(job) {
  if (job.status !== "review_required") {
    throw new Error("This quiz is not waiting for teacher review.");
  }

  const generated = job.result?.generated;
  const quizRequest = job.payload;
  if (!generated?.quiz) {
    throw new Error("Generated quiz preview is missing.");
  }

  let quizForSave;
  try {
    quizForSave = prepareQuizForAssignment(generated.quiz, {
      focus: quizRequest.focus,
      subject: quizRequest.subject,
    });
  } catch (error) {
    throw new Error(error.message || "Quiz failed readability checks.");
  }

  generated.quiz = quizForSave;
  return finalizeQuizGenerationJob(job, generated, quizRequest);
}

export function serializeQuizJobForClient(job) {
  const clarityReport =
    job.result?.clarityReport || job.result?.generated?.quiz?.clarityReport || null;
  const diagramReport =
    job.result?.diagramReport || job.result?.generated?.quiz?.diagramReport || null;
  const previewQuestions = job.result?.generated?.quiz?.questions || null;

  return {
    jobId: job.id,
    status: job.status,
    progressMessage: job.progressMessage,
    quiz: job.result?.quizId ? { id: job.result.quizId } : undefined,
    assignment: job.result?.assignmentId ? { id: job.result.assignmentId } : undefined,
    source: job.result?.source,
    clarityReport,
    diagramReport,
    previewQuestions,
    needsReview: job.status === "review_required" || Boolean(clarityReport?.needsReview),
    error: job.errorMessage || undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}
