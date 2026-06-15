export function ensureCurriculumVectorsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS curriculum_doc_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      focus_label TEXT NOT NULL UNIQUE,
      year_level TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      acara_codes TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'generating', 'generated', 'embedded', 'failed')),
      full_doc TEXT,
      error_message TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      generated_at TEXT,
      embedded_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS curriculum_doc_jobs_status_idx
      ON curriculum_doc_jobs(status);

    CREATE TABLE IF NOT EXISTS curriculum_doc_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      focus_label TEXT NOT NULL,
      year_level TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      acara_codes TEXT,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (focus_label, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS curriculum_doc_chunks_focus_idx
      ON curriculum_doc_chunks(focus_label);

    CREATE INDEX IF NOT EXISTS curriculum_doc_chunks_year_subject_idx
      ON curriculum_doc_chunks(year_level, subject);
  `);
}
