import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { stockDaily, stocks } from "../db/schema";
import { ApiError, ok } from "../lib/responses";
import { fetchKline, tsCodeToSecid, type KLinePeriod } from "../services/eastmoney";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const RANGE_DAYS: Record<string, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "3Y": 1095,
};

const PERIOD_MAP: Record<string, KLinePeriod> = {
  "1W": "101", // 日K
  "1M": "101",
  "3M": "101",
  "6M": "102", // 周K
  "1Y": "102",
  "3Y": "103", // 月K
};

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

app.get("/:ts_code", async (c) => {
  const ts_code = c.req.param("ts_code");
  const range = (c.req.query("range") ?? "3M") as keyof typeof RANGE_DAYS;
  const days = RANGE_DAYS[range] ?? 90;
  const period = PERIOD_MAP[range] ?? "101";

  const db = createDb(c.env.DB);

  // 验证股票存在
  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");

  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const startDate = fmtDate(start);
  const endDate = fmtDate(today);

  // 1. 先查本地数据库
  let rows = await db
    .select()
    .from(stockDaily)
    .where(
      and(
        eq(stockDaily.ts_code, ts_code),
        gte(stockDaily.trade_date, startDate),
        lte(stockDaily.trade_date, endDate)
      )
    )
    .orderBy(asc(stockDaily.trade_date));

  // 2. 本地数据不足（<80% 应有条数）→ 优先从东方财富拉取
  const expectedCount = Math.ceil(days / 0.7); // 交易日约占日历的 70%
  const isLocalFresh = rows.length >= expectedCount * 0.5;

  if (!isLocalFresh || rows.length === 0) {
    try {
      const klines = await fetchKline(ts_code, period, startDate, endDate, 800);
      if (klines.length > 0) {
        // 批量 upsert
        for (const row of klines) {
          await db
            .insert(stockDaily)
            .values({
              ts_code,
              trade_date: row.trade_date.replace(/-/g, ""),
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              pre_close: row.close - row.price_change,
              change: row.price_change,
              pct_chg: row.pct_chg,
              vol: row.vol,
              amount: row.amount,
            })
            .onConflictDoUpdate({
              target: [stockDaily.ts_code, stockDaily.trade_date],
              set: {
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                pre_close: row.close - row.price_change,
                change: row.price_change,
                pct_chg: row.pct_chg,
                vol: row.vol,
                amount: row.amount,
              },
            });
        }
        // 重新查本地
        rows = await db
          .select()
          .from(stockDaily)
          .where(
            and(
              eq(stockDaily.ts_code, ts_code),
              gte(stockDaily.trade_date, startDate),
              lte(stockDaily.trade_date, endDate)
            )
          )
          .orderBy(asc(stockDaily.trade_date));
      }
    } catch (err) {
      console.error("EastMoney kline fetch failed:", err);
    }
  }

  return c.json(
    ok({
      items: rows,
      count: rows.length,
      source: rows.length ? "database" : "empty",
      secid: tsCodeToSecid(ts_code),
    })
  );
});

// 支持按日K/周K/月K 指定 period
app.get("/:ts_code/period/:period", async (c) => {
  const ts_code = c.req.param("ts_code");
  const period = c.req.param("period") as KLinePeriod;
  if (!["101", "102", "103", "104"].includes(period)) {
    throw new ApiError(400, "Invalid period. Use: 101=日K, 102=周K, 103=月K, 104=季K");
  }

  const db = createDb(c.env.DB);
  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");

  const today = new Date();
  const start = new Date(today.getTime() - 365 * 3 * 24 * 60 * 60 * 1000); // 3年
  const startDate = fmtDate(start);
  const endDate = fmtDate(today);

  const rows = await db
    .select()
    .from(stockDaily)
    .where(
      and(
        eq(stockDaily.ts_code, ts_code),
        gte(stockDaily.trade_date, startDate),
        lte(stockDaily.trade_date, endDate)
      )
    )
    .orderBy(asc(stockDaily.trade_date));

  if (rows.length === 0) {
    try {
      const klines = await fetchKline(ts_code, period, startDate, endDate, 600);
      for (const row of klines) {
        await db
          .insert(stockDaily)
          .values({
            ts_code,
            trade_date: row.trade_date.replace(/-/g, ""),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            pre_close: row.close - row.price_change,
            change: row.price_change,
            pct_chg: row.pct_chg,
            vol: row.vol,
            amount: row.amount,
          })
          .onConflictDoUpdate({
            target: [stockDaily.ts_code, stockDaily.trade_date],
            set: {
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              pre_close: row.close - row.price_change,
              change: row.price_change,
              pct_chg: row.pct_chg,
              vol: row.vol,
              amount: row.amount,
            },
          });
      }
      const refreshed = await db
        .select()
        .from(stockDaily)
        .where(
          and(
            eq(stockDaily.ts_code, ts_code),
            gte(stockDaily.trade_date, startDate),
            lte(stockDaily.trade_date, endDate)
          )
        )
        .orderBy(asc(stockDaily.trade_date));
      return c.json(ok({ items: refreshed, count: refreshed.length, source: "eastmoney" }));
    } catch (err) {
      console.error("EastMoney period kline failed:", err);
      return c.json(ok({ items: [], count: 0, source: "error" }));
    }
  }

  return c.json(ok({ items: rows, count: rows.length, source: "database" }));
});

export default app;
