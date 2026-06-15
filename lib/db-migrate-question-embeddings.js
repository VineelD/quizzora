export function ensureQuestionEmbeddingsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_embeddings (
      question_id INTEGER PRIMARY KEY REFERENCES question_bank_items(id) ON DELETE CASCADE,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      text_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS question_embeddings_model_idx
      ON question_embeddings(model);
  `);
}
