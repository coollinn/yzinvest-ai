import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { favorites, notes, stocks, users } from "../db/schema";
import { ok } from "../lib/responses";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { fetchStockBasic } from "../services/tushare";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requireAuth, requireAdmin);

app.get("/dashboard", async (c) => {
  const db = createDb(c.env.DB);
  const [u] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [s] = await db.select({ count: sql<number>`count(*)` }).from(stocks);
  const [n] = await db.select({ count: sql<number>`count(*)` }).from(notes);
  const [f] = await db.select({ count: sql<number>`count(*)` }).from(favorites);
  return c.json(
    ok({
      user_stats: {
        total_users: Number(u?.count ?? 0),
        total_notes: Number(n?.count ?? 0),
        total_favorites: Number(f?.count ?? 0),
      },
      system_stats: {
        total_stocks: Number(s?.count ?? 0),
      },
    })
  );
});

app.get("/users", async (c) => {
  const db = createDb(c.env.DB);
  const items = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      full_name: users.full_name,
      role: users.role,
      created_at: users.created_at,
    })
    .from(users);
  return c.json(ok({ items, count: items.length }));
});

app.post("/sync/stocks", async (c) => {
  const list = await fetchStockBasic(c.env.TUSHARE_TOKEN);
  const db = createDb(c.env.DB);
  let inserted = 0;
  for (const row of list) {
    await db
      .insert(stocks)
      .values(row)
      .onConflictDoUpdate({
        target: stocks.ts_code,
        set: {
          symbol: row.symbol,
          name: row.name,
          area: row.area,
          industry: row.industry,
          fullname: row.fullname,
          enname: row.enname,
          cnspell: row.cnspell,
          market: row.market,
          exchange: row.exchange,
          curr_type: row.curr_type,
          list_status: row.list_status,
          list_date: row.list_date,
          delist_date: row.delist_date,
          is_hs: row.is_hs,
          act_name: row.act_name,
          act_ent_type: row.act_ent_type,
          updated_at: new Date().toISOString(),
        },
      });
    inserted += 1;
  }
  return c.json(ok({ message: "synced", count: inserted }));
});

export default app;
