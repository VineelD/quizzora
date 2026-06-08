function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

export function ensureFamilyBillingSchema(db) {
  ensureColumn(db, "families", "trial_ends_at", "TEXT");
  ensureColumn(db, "families", "subscription_status", "TEXT NOT NULL DEFAULT 'trialing'");
  ensureColumn(db, "families", "plan_interval", "TEXT");
  ensureColumn(db, "families", "stripe_customer_id", "TEXT");
  ensureColumn(db, "families", "stripe_subscription_id", "TEXT");
  ensureColumn(db, "families", "current_period_end", "TEXT");
  ensureColumn(db, "families", "pending_plan_interval", "TEXT");
  ensureColumn(db, "families", "pending_price_id", "TEXT");
  ensureColumn(db, "families", "plan_change_at", "TEXT");
  ensureColumn(db, "families", "cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "families", "allow_late_submissions", "INTEGER NOT NULL DEFAULT 1");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS families_stripe_customer_idx
    ON families(stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS family_monthly_usage (
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      month_key TEXT NOT NULL,
      ai_quiz_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (family_id, month_key)
    );
  `);

  ensureColumn(db, "billing_events", "family_id", "INTEGER REFERENCES families(id) ON DELETE SET NULL");
  ensureColumn(db, "support_tickets", "family_id", "INTEGER REFERENCES families(id)");

  db.prepare(
    `
    UPDATE families
    SET
      subscription_status = COALESCE(subscription_status, 'trialing'),
      trial_ends_at = COALESCE(trial_ends_at, datetime(created_at, '+7 days'))
    WHERE trial_ends_at IS NULL AND subscription_status IN ('trialing', '', NULL)
  `,
  ).run();
}
