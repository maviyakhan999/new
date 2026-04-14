import { db } from "./index";
import { sql } from "drizzle-orm";

db.run(sql`CREATE TABLE IF NOT EXISTS wallets (
  client_id INTEGER PRIMARY KEY,
  balance REAL NOT NULL DEFAULT 0
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fulfillment_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

console.log("Tables created!");
