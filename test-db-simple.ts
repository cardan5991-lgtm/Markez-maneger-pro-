import Database from "better-sqlite3";
try {
  const db = new Database("markez.db");
  console.log("DB OK");
  db.close();
} catch (e) {
  console.error("DB FAIL", e);
  process.exit(1);
}
