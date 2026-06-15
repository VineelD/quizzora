import { enumerateCurriculumCells } from "./question-bank-cells.js";
import { getDb } from "./db.js";
import { countEmbeddedChunks } from "./curriculum-doc-embed.js";

export function getCurriculumDocStatusPayload() {
  const db = getDb();
  const totalSubtopics = enumerateCurriculumCells().length;

  const generatedRow = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM curriculum_doc_jobs
      WHERE status IN ('generated', 'embedded')
      `,
    )
    .get();

  const embeddedJobsRow = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM curriculum_doc_jobs
      WHERE status = 'embedded'
      `,
    )
    .get();

  const chunkRow = db.prepare("SELECT COUNT(*) AS count FROM curriculum_doc_chunks").get();
  const failedRow = db
    .prepare("SELECT COUNT(*) AS count FROM curriculum_doc_jobs WHERE status = 'failed'")
    .get();

  const embeddedChunks = countEmbeddedChunks();

  return {
    totalSubtopics,
    generatedSubtopics: Number(generatedRow?.count || 0),
    embeddedSubtopics: Number(embeddedJobsRow?.count || 0),
    totalChunks: Number(chunkRow?.count || 0),
    embeddedChunks,
    failedSubtopics: Number(failedRow?.count || 0),
    ragEnabled: process.env.STUDY_COACH_RAG_ENABLED === "true",
    embedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
    docModel: process.env.CURRICULUM_DOC_MODEL || "gpt-4.1-mini",
    summary: `Curriculum docs: ${Number(generatedRow?.count || 0)}/${totalSubtopics} subtopics, ${embeddedChunks} chunks embedded`,
  };
}
