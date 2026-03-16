import Database from "better-sqlite3";
const db = new Database(":memory:");
console.log("Database initialized successfully");
db.close();
