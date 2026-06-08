import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

const db = new DatabaseSync(process.env.SQLITE_DATABASE_PATH || join(process.cwd(), "data", "littlecode.sqlite"));
console.log(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users'").all());
