/**
 * Online SQLite backup for production using node:sqlite backup API.
 * Safe while the app is running (WAL mode).
 *
 * Usage:
 *   node scripts/backup-prod-db.mjs [--output <path.sqlite>]
 *
 * Env:
 *   SQLITE_DATABASE_PATH  (default: C:\LittleCode\data\littlecode.sqlite)
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

const PRODUCTION_DB = "C:\\LittleCode\\data\\littlecode.sqlite";

function parseArgs(argv) {
  const args = { output: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--output" && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

const sourcePath = resolve(process.env.SQLITE_DATABASE_PATH || PRODUCTION_DB);
const normalizedSource = sourcePath.replace(/\//g, "\\");

if (normalizedSource.toLowerCase() !== PRODUCTION_DB.toLowerCase()) {
  console.error(JSON.stringify({ ok: false, error: "Refusing to backup non-production database", source: sourcePath }));
  process.exit(1);
}

if (!existsSync(sourcePath)) {
  console.error(JSON.stringify({ ok: false, error: "Database not found", source: sourcePath }));
  process.exit(1);
}

const { output } = parseArgs(process.argv.slice(2));
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace("T", "-")
  .slice(0, 15);
const backupPath = output ? resolve(output) : resolve(dirname(sourcePath), `littlecode-${stamp}.sqlite`);

mkdirSync(dirname(backupPath), { recursive: true });

const source = new DatabaseSync(sourcePath);
try {
  backup(source, backupPath);
} finally {
  source.close();
}

console.log(
  JSON.stringify(
    {
      ok: true,
      source: sourcePath,
      backup: backupPath,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ),
);
