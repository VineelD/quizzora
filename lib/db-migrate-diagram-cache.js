export function ensureDiagramCacheSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diagram_image_cache (
      prompt_hash TEXT PRIMARY KEY,
      image_id INTEGER NOT NULL REFERENCES quiz_question_images(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
