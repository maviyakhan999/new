import express from "express";
import { db } from "./db";
import { wallets, ledger, orders, idempotencyKeys } from "./db/schema";
import { eq } from "drizzle-orm";

const app = express();
app.use(express.json());

app.post("/admin/wallet/credit", async (req, res) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    if (idempotencyKey) {
      const cached = db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, idempotencyKey))
        .get();
      if (cached) {
        return res
          .status(cached.statusCode)
          .json(JSON.parse(cached.responseBody));
      }
    }

    const { client_id, amount } = req.body;
    if (!client_id || !amount) {
      return res.status(400).json({ error: "client_id and amount required" });
    }

    const result = db.transaction((tx) => {
      const existing = tx
        .select()
        .from(wallets)
        .where(eq(wallets.clientId, client_id))
        .get();

      if (existing) {
        tx.update(wallets)
          .set({ balance: existing.balance + amount })
          .where(eq(wallets.clientId, client_id))
          .run();
      } else {
        tx.insert(wallets)
          .values({ clientId: client_id, balance: amount })
          .run();
      }

      tx.insert(ledger)
        .values({ clientId: client_id, type: "credit", amount })
        .run();

      const wallet = tx
        .select()
        .from(wallets)
        .where(eq(wallets.clientId, client_id))
        .get();
      return { message: "Credited", balance: wallet!.balance };
    });

    if (idempotencyKey) {
      db.insert(idempotencyKeys)
        .values({
          key: idempotencyKey,
          statusCode: 200,
          responseBody: JSON.stringify(result),
        })
        .run();
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/admin/wallet/debit", async (req, res) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    if (idempotencyKey) {
      const cached = db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, idempotencyKey))
        .get();
      if (cached) {
        return res
          .status(cached.statusCode)
          .json(JSON.parse(cached.responseBody));
      }
    }

    const { client_id, amount } = req.body;
    if (!client_id || !amount) {
      return res.status(400).json({ error: "client_id and amount required" });
    }

    const wallet = db
      .select()
      .from(wallets)
      .where(eq(wallets.clientId, client_id))
      .get();
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });
    if (wallet.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    db.transaction((tx) => {
      tx.update(wallets)
        .set({ balance: wallet.balance - amount })
        .where(eq(wallets.clientId, client_id))
        .run();

      tx.insert(ledger)
        .values({ clientId: client_id, type: "debit", amount })
        .run();
    });

    const body = { message: "Debited", balance: wallet.balance - amount };

    if (idempotencyKey) {
      db.insert(idempotencyKeys)
        .values({
          key: idempotencyKey,
          statusCode: 200,
          responseBody: JSON.stringify(body),
        })
        .run();
    }

    res.json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/orders", async (req, res) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    if (idempotencyKey) {
      const cached = db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, idempotencyKey))
        .get();
      if (cached) {
        return res
          .status(cached.statusCode)
          .json(JSON.parse(cached.responseBody));
      }
    }

    const clientId = Number(req.headers["client-id"]);
    const { amount } = req.body;
    if (!clientId || !amount) {
      return res
        .status(400)
        .json({ error: "client-id header and amount required" });
    }

    const wallet = db
      .select()
      .from(wallets)
      .where(eq(wallets.clientId, clientId))
      .get();
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });
    if (wallet.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const order = db.transaction((tx) => {
      tx.update(wallets)
        .set({ balance: wallet.balance - amount })
        .where(eq(wallets.clientId, clientId))
        .run();

      const created = tx
        .insert(orders)
        .values({ clientId, amount, status: "pending" })
        .returning()
        .get();

      tx.insert(ledger).values({ clientId, type: "debit", amount }).run();

      return created;
    });

    const response = await fetch("https://jsonplaceholder.typicode.com/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: clientId, title: order.id }),
    });
    const data = (await response.json()) as { id: number };

    db.update(orders)
      .set({ fulfillmentId: String(data.id), status: "fulfilled" })
      .where(eq(orders.id, order.id))
      .run();

    const updated = db
      .select()
      .from(orders)
      .where(eq(orders.id, order.id))
      .get();
    const body = {
      order_id: updated!.id,
      fulfillment_id: updated!.fulfillmentId,
      status: updated!.status,
    };

    if (idempotencyKey) {
      db.insert(idempotencyKeys)
        .values({
          key: idempotencyKey,
          statusCode: 201,
          responseBody: JSON.stringify(body),
        })
        .run();
    }

    res.status(201).json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/orders/:order_id", async (req, res) => {
  try {
    const clientId = Number(req.headers["client-id"]);
    const orderId = Number(req.params.order_id);

    const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.clientId !== clientId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/wallet/balance", async (req, res) => {
  try {
    const clientId = Number(req.headers["client-id"]);

    const wallet = db
      .select()
      .from(wallets)
      .where(eq(wallets.clientId, clientId))
      .get();
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    res.json({ client_id: wallet.clientId, balance: wallet.balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
