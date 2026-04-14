import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

export const wallets = sqliteTable("wallets", {
  clientId: integer("client_id").primaryKey(),
  balance: real("balance").notNull().default(0),
});

export const ledger = sqliteTable("ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"),
  fulfillmentId: text("fulfillment_id"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  statusCode: integer("status_code").notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});
