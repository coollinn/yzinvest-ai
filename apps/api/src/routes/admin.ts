import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { stockDaily, stocks } from "../db/schema";
import { ok } from "../lib/responses";
import { requireAdmin, requireAuth } from "../middleware/auth";
import {
  fetchStockList,
  type MarketType,
} from "../services/eastmoney";
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

/**
 * POST /api/admin/sync/stocks
 * 从东方财富同步股票列表 + 实时行情到本地数据库
 * Query params:
 *   - market: 市场类型 (SH|SZ|BJ|HS|ZT|CB)，默认 HS（全A）
 *   - page: 页码，默认 1
 *   - pageSize: 每页数量，默认 200（东方财富最大）
 *   - syncDaily: 是否同步日K数据，默认 true
 */
app.post("/sync/stocks", async (c) => {
  const market = (c.req.query("market") ?? "HS") as MarketType;
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(c.req.query("pageSize") ?? "200", 10)));
  const syncDaily = c.req.query("syncDaily") !== "false";

  const db = createDb(c.env.DB);

  // 1. 从东方财富获取股票列表
  const result = await fetchStockList(page, pageSize, market);
  const items = result.items;

  if (items.length === 0) {
    return c.json(ok({
      message: "No data returned from East Money API",
      count: 0,
      total: result.total,
    }));
  }

  let stockCount = 0;
  let dailyCount = 0;

  // 2. 获取当前日期（用于日K数据）
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}${m}${d}`;

  for (const item of items) {
    // 3a. Upsert stocks 表（基础信息）
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

    // 3b. Upsert stockDaily 日线数据
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

/**
 * POST /api/admin/sync/stocks/all
 * 分页同步所有股票（自动翻页直到完成）
 * Query params:
 *   - market: 市场类型，默认 HS
 *   - pageSize: 每页数量，默认 200
 *   - maxPages: 最大页数，默认 5（即最多 1000 条）
 */
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
        // Upsert stocks
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

        // Upsert stockDaily
        if (item.current_price > 0) {
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
          totalDaily++;
        }
        totalStocks++;
      }

      // 如果已获取全部数据，退出循环
      if (page * pageSize >= result.total) break;
    } catch (err) {
      errors.push(`Page ${page} failed: ${(err as Error).message}`);
      if (errors.length >= 3) break; // 连续失败则停止
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

export default app;
