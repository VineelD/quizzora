export function ensureQuestionBankSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_bank_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      focus_label TEXT NOT NULL,
      year_level TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      acara_codes TEXT,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('core', 'standard', 'extension')),
      question_style TEXT NOT NULL DEFAULT 'worded'
        CHECK(question_style IN ('worded', 'mcq', 'mixed')),
      question_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      quality_status TEXT NOT NULL DEFAULT 'published'
        CHECK(quality_status IN ('draft', 'published', 'rejected', 'retired')),
      source TEXT NOT NULL DEFAULT 'openai_batch',
      fill_run_id INTEGER REFERENCES question_bank_fill_runs(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (focus_label, content_hash)
    );

    CREATE INDEX IF NOT EXISTS question_bank_items_lookup_idx
      ON question_bank_items(year_level, subject, focus_label, difficulty, quality_status);

    CREATE TABLE IF NOT EXISTS question_bank_fill_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('running', 'paused', 'completed', 'failed')),
      target_per_cell INTEGER NOT NULL DEFAULT 60,
      requests_total INTEGER NOT NULL DEFAULT 0,
      requests_published INTEGER NOT NULL DEFAULT 0,
      requests_rejected INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS question_bank_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES question_bank_fill_runs(id) ON DELETE CASCADE,
      shard_key TEXT NOT NULL,
      year_level TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle'
        CHECK(status IN ('idle', 'submitting', 'batch_active', 'ingesting', 'completed', 'failed')),
      openai_batch_id TEXT,
      openai_input_file_id TEXT,
      openai_output_file_id TEXT,
      openai_error_file_id TEXT,
      requests_in_batch INTEGER NOT NULL DEFAULT 0,
      requests_ingested INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (run_id, shard_key)
    );

    CREATE TABLE IF NOT EXISTS question_bank_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES question_bank_fill_runs(id) ON DELETE CASCADE,
      agent_shard TEXT NOT NULL,
      custom_id TEXT NOT NULL UNIQUE,
      focus_label TEXT NOT NULL,
      year_level TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      acara_codes TEXT,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('core', 'standard', 'extension')),
      question_style TEXT NOT NULL DEFAULT 'worded',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'submitted', 'published', 'rejected')),
      batch_id TEXT,
      reject_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS question_bank_requests_run_status_idx
      ON question_bank_requests(run_id, agent_shard, status);

    CREATE INDEX IF NOT EXISTS question_bank_requests_batch_idx
      ON question_bank_requests(batch_id, status);
  `);
}
