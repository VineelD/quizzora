function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

export function ensureBillingSchema(db) {
  ensureColumn(db, "schools", "trial_ends_at", "TEXT");
  ensureColumn(db, "schools", "subscription_status", "TEXT NOT NULL DEFAULT 'trialing'");
  ensureColumn(db, "schools", "plan_interval", "TEXT");
  ensureColumn(db, "schools", "stripe_customer_id", "TEXT");
  ensureColumn(db, "schools", "stripe_subscription_id", "TEXT");
  ensureColumn(db, "schools", "current_period_end", "TEXT");
  ensureColumn(db, "schools", "pending_plan_interval", "TEXT");
  ensureColumn(db, "schools", "pending_price_id", "TEXT");
  ensureColumn(db, "schools", "plan_change_at", "TEXT");
  ensureColumn(db, "schools", "cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS schools_stripe_customer_idx
    ON schools(stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS billing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
      stripe_event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS school_monthly_usage (
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      month_key TEXT NOT NULL,
      ai_quiz_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (school_id, month_key)
    );
  `);

  ensureColumn(db, "schools", "plan_tier", "TEXT");

  db.prepare(
    `
    UPDATE schools
    SET
      subscription_status = COALESCE(subscription_status, 'trialing'),
      trial_ends_at = COALESCE(trial_ends_at, datetime(created_at, '+7 days'))
    WHERE trial_ends_at IS NULL AND subscription_status IN ('trialing', '', NULL)
  `,
  ).run();
}
