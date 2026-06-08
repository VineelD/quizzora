function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

export function ensureQuizTimingSchema(db) {
  ensureColumn(db, "quiz_assignments", "timed_mode", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "quiz_assignments", "overall_time_limit_seconds", "INTEGER");
}
