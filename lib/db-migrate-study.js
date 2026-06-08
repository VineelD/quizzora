function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

export function ensureStudySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assignment_study_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id INTEGER NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
      student_message_count INTEGER NOT NULL DEFAULT 0,
      session_started_at TEXT,
      last_active_at TEXT,
      quiz_unlocked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, assignment_id)
    );

    CREATE TABLE IF NOT EXISTS study_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id INTEGER NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('student', 'assistant', 'system')),
      content TEXT NOT NULL,
      flagged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS study_messages_assignment_student_idx
      ON study_messages(assignment_id, student_id, created_at);
  `);

  ensureColumn(db, "assignment_study_progress", "qualified_study_seconds", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "assignment_study_progress", "last_qualified_at", "TEXT");
  ensureColumn(db, "assignment_study_progress", "on_topic_message_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "study_messages", "on_topic", "INTEGER");
  ensureColumn(db, "study_messages", "payload_json", "TEXT");
  ensureColumn(db, "assignment_study_progress", "openai_last_response_id", "TEXT");
  ensureColumn(db, "quizzes", "selected_topics_json", "TEXT");
  ensureColumn(db, "quizzes", "selected_subtopics_json", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS study_coach_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id INTEGER NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
      message_id INTEGER REFERENCES study_messages(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/pdf',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, message_id)
    );

    CREATE INDEX IF NOT EXISTS study_coach_files_assignment_student_idx
      ON study_coach_files(assignment_id, student_id, created_at DESC);
  `);
}
