function usersTableHasColumn(db, columnName) {
  const columns = db.prepare("PRAGMA table_info(users)").all();
  return columns.some((column) => column.name === columnName);
}

export function ensureTermsSchema(db) {
  if (!usersTableHasColumn(db, "terms_accepted_at")) {
    db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT");
  }
  if (!usersTableHasColumn(db, "terms_version")) {
    db.exec("ALTER TABLE users ADD COLUMN terms_version TEXT");
  }
}
