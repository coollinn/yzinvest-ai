import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { stockDaily, stocks } from "../db/schema";
import { ApiError, ok } from "../lib/responses";
import { fetchDaily } from "../services/tushare";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const RANGE_DAYS: Record<string, number> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
};

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

app.get("/:ts_code", async (c) => {
  const ts_code = c.req.param("ts_code");
  const range = c.req.query("range") ?? "3M";
  const days = RANGE_DAYS[range] ?? 90;

  const db = createDb(c.env.DB);

  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");

  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const startDate = fmtDate(start);
  const endDate = fmtDate(today);

  // 先查本地
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

  // 本地为空 → fallback 到 Tushare 实时拉，并落库
  if (rows.length === 0) {
    try {
      const tushare = await fetchDaily(ts_code, startDate, endDate, c.env.TUSHARE_TOKEN);
      if (tushare.length > 0) {
        // upsert 一批
        for (const row of tushare) {
          await db
            .insert(stockDaily)
            .values(row)
            .onConflictDoUpdate({
              target: [stockDaily.ts_code, stockDaily.trade_date],
              set: {
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                pre_close: row.pre_close,
                change: row.change,
                pct_chg: row.pct_chg,
                vol: row.vol,
                amount: row.amount,
              },
            });
        }
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
      console.error("Tushare daily fetch failed:", err);
    }
  }

  return c.json(ok({ items: rows, count: rows.length, source: rows.length ? "database" : "empty" }));
});

export default app;
