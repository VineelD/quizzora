export function ensureQuizJobSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_generation_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'completed', 'failed')) DEFAULT 'queued',
      payload_json TEXT NOT NULL,
      result_json TEXT,
      error_message TEXT,
      progress_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS quiz_generation_jobs_status_created_idx
      ON quiz_generation_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS quiz_generation_jobs_user_id_idx
      ON quiz_generation_jobs(user_id);
  `);
}
