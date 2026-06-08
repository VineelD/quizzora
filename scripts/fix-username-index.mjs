import { getDb } from "../lib/db.js";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

const dbPath = process.env.SQLITE_DATABASE_PATH || join(process.cwd(), "data", "littlecode.sqlite");
getDb();

const db = new DatabaseSync(dbPath);
const before = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users'").all();
console.log("Before:", before);

db.exec("DROP INDEX IF EXISTS users_username_unique_idx;");

const after = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users'").all();
console.log("After:", after);
console.log("users table:", db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get());
