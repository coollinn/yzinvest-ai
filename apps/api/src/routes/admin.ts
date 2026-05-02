import { PaginationQuery } from "@yzinvest/shared";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { favorites, financialReports, notes, predictions, stockDaily, stocks, users } from "../db/schema";
import { hashPassword } from "../lib/password";
import { ApiError, ok, paginate, readJson } from "../lib/responses";
import { requireAdmin, requireAuth } from "../middleware/auth";
import {
  fetchKline,
  fetchStockList,
  fetchQuotes,
  type MarketType,
} from "../services/eastmoney";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requireAuth, requireAdmin);

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard
// ---------------------------------------------------------------------------
app.get("/dashboard", async (c) => {
  const db = createDb(c.env.DB);
  const [u] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [s] = await db.select({ count: sql<number>`count(*)` }).from(stocks);
  const [n] = await db.select({ count: sql<number>`count(*)` }).from(notes);
  const [f] = await db.select({ count: sql<number>`count(*)` }).from(favorites);
  const [p] = await db.select({ count: sql<number>`count(*)` }).from(predictions);
  const [r] = await db.select({ count: sql<number>`count(*)` }).from(financialReports);
  return c.json(
    ok({
      user_stats: {
        total_users: Number(u?.count ?? 0),
        total_notes: Number(n?.count ?? 0),
        total_favorites: Number(f?.count ?? 0),
      },
      system_stats: {
        total_stocks: Number(s?.count ?? 0),
        total_predictions: Number(p?.count ?? 0),
        total_reports: Number(r?.count ?? 0),
      },
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/admin/users — 用户列表（支持搜索）
// ---------------------------------------------------------------------------
app.get("/users", async (c) => {
  const { page, limit } = PaginationQuery.parse({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  const q = c.req.query("q")?.trim();

  const db = createDb(c.env.DB);
  const where = q
    ? or(like(users.username, `%${q}%`), like(users.email, `%${q}%`))
    : undefined;

  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(where);
  const total = Number(totalRow[0]?.count ?? 0);

  const items = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      full_name: users.full_name,
      role: users.role,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.created_at))
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(ok({ items, pagination: paginate(total, page, limit) }));
});

app.put("/users/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const body = await readJson<{ role?: "user" | "admin"; full_name?: string; email?: string }>(c);
  const db = createDb(c.env.DB);

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) throw new ApiError(404, "User not found");

  const [updated] = await db
    .update(users)
    .set({
      ...(body.role ? { role: body.role } : {}),
      ...(body.full_name !== undefined ? { full_name: body.full_name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      updated_at: new Date().toISOString(),
    })
    .where(eq(users.id, id))
    .returning();

  return c.json(ok(updated));
});

app.delete("/users/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const db = createDb(c.env.DB);
  await db.delete(users).where(eq(users.id, id));
  return c.json(ok({ deleted: true }));
});

app.post("/users/:id/reset-password", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const body = await readJson<{ new_password: string }>(c);
  if (!body?.new_password || body.new_password.length < 6) {
    throw new ApiError(400, "new_password must be at least 6 characters");
  }

  const db = createDb(c.env.DB);
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) throw new ApiError(404, "User not found");

  const newHash = await hashPassword(body.new_password);
  await db
    .update(users)
    .set({ password_hash: newHash, updated_at: new Date().toISOString() })
    .where(eq(users.id, id));

  return c.json(ok({ message: "Password reset successfully" }));
});

// ---------------------------------------------------------------------------
// GET /api/admin/notes — 笔记列表（支持搜索 + 用户筛选）
// ---------------------------------------------------------------------------
app.get("/notes", async (c) => {
  const { page, limit } = PaginationQuery.parse({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  const q = c.req.query("q")?.trim();
  const userId = c.req.query("user_id")?.trim();

  const db = createDb(c.env.DB);
  const conditions: Array<ReturnType<typeof eq> | ReturnType<typeof like>> = [];
  if (userId) conditions.push(eq(notes.user_id, parseInt(userId, 10)));
  if (q) conditions.push(like(notes.content, `%${q}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRow = await db.select({ count: sql<number>`count(*)` }).from(notes).where(where);
  const total = Number(totalRow[0]?.count ?? 0);

  const items = await db
    .select({
      id: notes.id,
      user_id: notes.user_id,
      ts_code: notes.ts_code,
      content: notes.content,
      analysis_type: notes.analysis_type,
      rating: notes.rating,
      tags: notes.tags,
      created_at: notes.created_at,
      updated_at: notes.updated_at,
      username: users.username,
    })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.user_id))
    .where(where)
    .orderBy(desc(notes.updated_at))
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(ok({ items, pagination: paginate(total, page, limit) }));
});

app.delete("/notes/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const db = createDb(c.env.DB);
  await db.delete(notes).where(eq(notes.id, id));
  return c.json(ok({ deleted: true }));
});

// ---------------------------------------------------------------------------
// GET /api/admin/favorites — 收藏管理列表
// ---------------------------------------------------------------------------
app.get("/favorites", async (c) => {
  const { page, limit } = PaginationQuery.parse({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  const ts_code = c.req.query("ts_code")?.trim();

  const db = createDb(c.env.DB);
  const where = ts_code ? eq(favorites.ts_code, ts_code) : undefined;
  const totalRow = await db.select({ count: sql<number>`count(*)` }).from(favorites).where(where);
  const total = Number(totalRow[0]?.count ?? 0);

  const items = await db
    .select({
      id: favorites.id,
      user_id: favorites.user_id,
      ts_code: favorites.ts_code,
      sort_order: favorites.sort_order,
      created_at: favorites.created_at,
      username: users.username,
    })
    .from(favorites)
    .leftJoin(users, eq(users.id, favorites.user_id))
    .where(where)
    .orderBy(desc(favorites.created_at))
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(ok({ items, pagination: paginate(total, page, limit) }));
});

app.delete("/favorites/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const db = createDb(c.env.DB);
  await db.delete(favorites).where(eq(favorites.id, id));
  return c.json(ok({ deleted: true }));
});

// ---------------------------------------------------------------------------
// GET /api/admin/db/stocks — 股票数据（支持搜索）
// ---------------------------------------------------------------------------
app.get("/db/stocks", async (c) => {
  const { page, limit } = PaginationQuery.parse({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  const q = c.req.query("q")?.trim();

  const db = createDb(c.env.DB);
  const where = q
    ? or(
        like(stocks.symbol, `%${q}%`),
        like(stocks.name, `%${q}%`),
        like(stocks.industry, `%${q}%`)
      )
    : undefined;

  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(stocks)
    .where(where);
  const total = Number(totalRow[0]?.count ?? 0);

  const items = await db
    .select()
    .from(stocks)
    .where(where)
    .orderBy(stocks.ts_code)
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(ok({ items, pagination: paginate(total, page, limit) }));
});

app.delete("/db/stocks/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const db = createDb(c.env.DB);
  await db.delete(stocks).where(eq(stocks.id, id));
  return c.json(ok({ deleted: true }));
});

// ---------------------------------------------------------------------------
// GET /api/admin/db/daily — 日线数据
// ---------------------------------------------------------------------------
app.get("/db/daily", async (c) => {
  const { page, limit } = PaginationQuery.parse({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  const ts_code = c.req.query("ts_code")?.trim();
  const trade_date = c.req.query("trade_date")?.trim();

  const db = createDb(c.env.DB);
  const conditions: Array<ReturnType<typeof eq>> = [];
  if (ts_code) conditions.push(eq(stockDaily.ts_code, ts_code));
  if (trade_date) conditions.push(eq(stockDaily.trade_date, trade_date));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(stockDaily)
    .where(where);
  const total = Number(totalRow[0]?.count ?? 0);

  const items = await db
    .select()
    .from(stockDaily)
    .where(where)
    .orderBy(desc(stockDaily.trade_date))
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(ok({ items, pagination: paginate(total, page, limit) }));
});

// DELETE /api/admin/db/daily/:ts_code/:trade_date
app.delete("/db/daily/:ts_code/:trade_date", async (c) => {
  const ts_code = c.req.param("ts_code");
  const trade_date = c.req.param("trade_date");

  const db = createDb(c.env.DB);
  await db
    .delete(stockDaily)
    .where(and(eq(stockDaily.ts_code, ts_code), eq(stockDaily.trade_date, trade_date)));
  return c.json(ok({ deleted: true }));
});

// ---------------------------------------------------------------------------
// POST /api/admin/sync/stocks — 同步股票列表
// ---------------------------------------------------------------------------
app.post("/sync/stocks", async (c) => {
  const market = (c.req.query("market") ?? "HS") as MarketType;
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(c.req.query("pageSize") ?? "200", 10)));
  const syncDaily = c.req.query("syncDaily") !== "false";

  const db = createDb(c.env.DB);
  const result = await fetchStockList(page, pageSize, market);
  const items = result.items;

  if (items.length === 0) {
    return c.json(ok({ message: "No data returned from East Money API", count: 0, total: result.total }));
  }

  let stockCount = 0;
  let dailyCount = 0;

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}${m}${d}`;

  for (const item of items) {
    const [existing] = await db
      .select({ ts_code: stocks.ts_code })
      .from(stocks)
      .where(eq(stocks.ts_code, item.ts_code))
      .limit(1);

    if (!existing) {
      await db
        .insert(stocks)
        .values({
          ts_code: item.ts_code,
          symbol: item.symbol,
          name: item.name,
          market: item.ts_code.endsWith(".SH")
            ? "主板"
            : item.ts_code.endsWith(".SZ")
            ? "主板"
            : "北交所",
          exchange: item.ts_code.split(".")[1],
          list_status: "L",
        })
        .onConflictDoNothing();
      stockCount++;
    }

    if (syncDaily && item.current_price > 0) {
      const preClose = item.current_price / (1 + item.pct_chg / 100);
      await db
        .insert(stockDaily)
        .values({
          ts_code: item.ts_code,
          trade_date: todayStr,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.current_price,
          pre_close: preClose,
          change: item.current_price - preClose,
          pct_chg: item.pct_chg,
          vol: item.volume,
          amount: item.amount,
        })
        .onConflictDoUpdate({
          target: [stockDaily.ts_code, stockDaily.trade_date],
          set: {
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.current_price,
            pre_close: preClose,
            change: item.current_price - preClose,
            pct_chg: item.pct_chg,
            vol: item.volume,
            amount: item.amount,
          },
        });
      dailyCount++;
    }
  }

  return c.json(ok({
    message: "sync complete",
    market,
    page,
    pageSize,
    fetched: items.length,
    total: result.total,
    stocks_upserted: stockCount,
    daily_upserted: dailyCount,
    note: result.total > pageSize
      ? `Total ${result.total} stocks available. Use page=2 to fetch more.`
      : undefined,
  }));
});

app.post("/sync/stocks/all", async (c) => {
  const market = (c.req.query("market") ?? "HS") as MarketType;
  const pageSize = Math.min(200, Math.max(1, parseInt(c.req.query("pageSize") ?? "200", 10)));
  const maxPages = Math.min(20, Math.max(1, parseInt(c.req.query("maxPages") ?? "5", 10)));

  const db = createDb(c.env.DB);
  let totalStocks = 0;
  let totalDaily = 0;
  const errors: string[] = [];

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}${m}${d}`;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const result = await fetchStockList(page, pageSize, market);
      if (result.items.length === 0) break;

      for (const item of result.items) {
        const [existing] = await db
          .select({ ts_code: stocks.ts_code })
          .from(stocks)
          .where(eq(stocks.ts_code, item.ts_code))
          .limit(1);

        if (!existing) {
          await db
            .insert(stocks)
            .values({
              ts_code: item.ts_code,
              symbol: item.symbol,
              name: item.name,
              market: item.ts_code.endsWith(".SH")
                ? "主板"
                : item.ts_code.endsWith(".SZ")
                ? "主板"
                : "北交所",
              exchange: item.ts_code.split(".")[1],
              list_status: "L",
            })
            .onConflictDoNothing();
        }

        if (item.current_price > 0) {
          const preClose = item.current_price / (1 + item.pct_chg / 100);
          const change = item.current_price - preClose;
          await db
            .insert(stockDaily)
            .values({
              ts_code: item.ts_code,
              trade_date: todayStr,
              open: item.open,
              high: item.high,
              low: item.low,
              close: item.current_price,
              pre_close: preClose,
              change: change,
              pct_chg: item.pct_chg,
              vol: item.volume,
              amount: item.amount,
            })
            .onConflictDoUpdate({
              target: [stockDaily.ts_code, stockDaily.trade_date],
              set: {
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.current_price,
                pre_close: preClose,
                change: change,
                pct_chg: item.pct_chg,
                vol: item.volume,
                amount: item.amount,
              },
            });
          totalDaily++;
        }
        totalStocks++;
      }

      if (page * pageSize >= result.total) break;
    } catch (err) {
      errors.push(`Page ${page} failed: ${(err as Error).message}`);
      if (errors.length >= 3) break;
    }
  }

  return c.json(ok({
    message: "batch sync complete",
    market,
    maxPages,
    pageSize,
    stocks_processed: totalStocks,
    daily_records: totalDaily,
    errors: errors.length > 0 ? errors : undefined,
  }));
});

// ---------------------------------------------------------------------------
// POST /api/admin/sync/kline — 同步指定股票的历史日K数据
// ---------------------------------------------------------------------------
app.post("/sync/kline", async (c) => {
  const ts_code = c.req.query("ts_code");
  if (!ts_code) throw new ApiError(400, "ts_code required");
  const days = Math.min(1095, Math.max(30, parseInt(c.req.query("days") ?? "365", 10)));

  const db = createDb(c.env.DB);
  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");

  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const klines = await fetchKline(ts_code, "101", fmt(start), fmt(today), 1200);
  let inserted = 0;

  for (const row of klines) {
    await db
      .insert(stockDaily)
      .values({
        ts_code,
        trade_date: row.date.replace(/-/g, ""),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        pre_close: row.close - (row.price_change ?? 0),
        change: row.price_change ?? 0,
        pct_chg: row.pct_chg,
        vol: row.volume,
        amount: row.amount,
      })
      .onConflictDoUpdate({
        target: [stockDaily.ts_code, stockDaily.trade_date],
        set: {
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          pre_close: row.close - (row.price_change ?? 0),
          change: row.price_change ?? 0,
          pct_chg: row.pct_chg,
          vol: row.volume,
          amount: row.amount,
        },
      });
    inserted++;
  }

  return c.json(ok({
    ts_code,
    days,
    fetched: klines.length,
    inserted_or_updated: inserted,
    range: `${fmt(start)} ~ ${fmt(today)}`,
  }));
});

// ---------------------------------------------------------------------------
// POST /api/admin/refresh/quotes — 刷新所有股票实时行情到 stockDaily
// ---------------------------------------------------------------------------
app.post("/refresh/quotes", async (c) => {
  const db = createDb(c.env.DB);
  const allStocks = await db.select({ ts_code: stocks.ts_code }).from(stocks).limit(100);
  if (allStocks.length === 0) throw new ApiError(404, "No stocks in database");

  const tsCodes = allStocks.map((s) => s.ts_code);
  const quotes = await fetchQuotes(tsCodes);

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}${m}${d}`;

  let updated = 0;
  for (const q of quotes) {
    if (q.current_price <= 0) continue;
    await db
      .insert(stockDaily)
      .values({
        ts_code: q.ts_code,
        trade_date: todayStr,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.current_price,
        pre_close: q.pre_close,
        change: q.price_change,
        pct_chg: q.pct_chg,
        vol: q.volume,
        amount: q.amount,
      })
      .onConflictDoUpdate({
        target: [stockDaily.ts_code, stockDaily.trade_date],
        set: {
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.current_price,
          pre_close: q.pre_close,
          change: q.price_change,
          pct_chg: q.pct_chg,
          vol: q.volume,
          amount: q.amount,
        },
      });
    updated++;
  }

  return c.json(ok({ message: "quotes refreshed", total: allStocks.length, updated, date: todayStr }));
});

export default app;
