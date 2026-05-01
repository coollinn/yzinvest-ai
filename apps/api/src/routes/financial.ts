import type { FinancialType } from "@yzinvest/shared";
import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createDb } from "../db/client";
import { financialData, stocks } from "../db/schema";
import { ApiError, ok } from "../lib/responses";
import {
  fetchFinancialIndicator,
  fetchFinancialReport,
  fetchLatestIndicator,
} from "../services/eastmoney";
import type { Env, Variables } from "../types";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const TYPES: FinancialType[] = [
  "balance_sheet",
  "income_statement",
  "cash_flow",
  "main_indicators",
];

const KV_TTL_SECONDS = 24 * 3600;

async function ensureStock(db: ReturnType<typeof createDb>, ts_code: string) {
  const [s] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!s) throw new ApiError(404, "Stock not found");
  return s;
}

// ---------------------------------------------------------------------------
// GET /api/financial/:ts_code/main-indicators — 财务指标（东方财富）
// ---------------------------------------------------------------------------
app.get("/:ts_code/main-indicators", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  const cacheKey = `fin:indicator:${ts_code}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json(ok({ stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name }, ...(cached as object) }));
  }

  try {
    const indicators = await fetchFinancialIndicator(ts_code);
    const latest = indicators[0] ?? null;

    // 关键指标
    const keyMetrics = latest
      ? {
          basic_eps: latest.BASIC_EPS,
          diluted_eps: latest.DILUTED_EPS,
          bps: latest.BPS, // 每股净资产
          roe_avg: latest.ROE_AVG, // 加权ROE
          debt_to_assets: latest.DEBT_TO_ASSETS, // 资产负债率
          pe_lyr: latest.PE_LYR,
          pe_ttm: latest.PE_TTM,
          pb: latest.PB_LYR,
          yoygr: latest.YOYGR, // 营收增长率
          yoyni: latest.YOYNI, // 净利润增长率
          report_date: latest.REPORT_DATE,
        }
      : null;

    // 存入 KV
    await c.env.CACHE.put(cacheKey, JSON.stringify({ indicators, latest: keyMetrics, key_metrics: keyMetrics }), {
      expirationTtl: KV_TTL_SECONDS,
    });
    c.header("X-Cache", "MISS");

    return c.json(
      ok({
        stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
        indicators,
        latest: keyMetrics,
        key_metrics: keyMetrics,
      })
    );
  } catch (err) {
    console.error("EastMoney financial indicator failed:", err);
    throw new ApiError(503, "Financial data temporarily unavailable");
  }
});

// ---------------------------------------------------------------------------
// GET /api/financial/:ts_code/income-statement — 利润表
// ---------------------------------------------------------------------------
app.get("/:ts_code/income-statement", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  const cacheKey = `fin:income:${ts_code}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json(ok({ stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name }, ...(cached as object) }));
  }

  try {
    const reports = await fetchFinancialReport(ts_code, "income_statement");

    // 组织为报告期 × 指标的二维结构
    const data: Record<string, Record<string, number | string | null>> = {};
    for (const r of reports) {
      const date = r.REPORT_DATE;
      data[date] ??= { report_date: date };
      for (const [k, v] of Object.entries(r)) {
        if (k === "SECURITY_CODE" || k === "REPORT_DATE") continue;
        data[date][k] = v as number | string | null;
      }
    }

    const sortedDates = Object.keys(data).sort((a, b) => b.localeCompare(a));
    const rows = sortedDates.map((date) => data[date]);

    await c.env.CACHE.put(cacheKey, JSON.stringify({ rows, data }), { expirationTtl: KV_TTL_SECONDS });
    c.header("X-Cache", "MISS");

    return c.json(
      ok({
        stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
        rows,
        count: rows.length,
      })
    );
  } catch (err) {
    console.error("EastMoney income statement failed:", err);
    throw new ApiError(503, "Financial data temporarily unavailable");
  }
});

// ---------------------------------------------------------------------------
// GET /api/financial/:ts_code/balance-sheet — 资产负债表
// ---------------------------------------------------------------------------
app.get("/:ts_code/balance-sheet", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  const cacheKey = `fin:balance:${ts_code}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json(ok({ stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name }, ...(cached as object) }));
  }

  try {
    const reports = await fetchFinancialReport(ts_code, "balance_sheet");
    const data: Record<string, Record<string, number | string | null>> = {};
    for (const r of reports) {
      const date = r.REPORT_DATE;
      data[date] ??= { report_date: date };
      for (const [k, v] of Object.entries(r)) {
        if (k === "SECURITY_CODE" || k === "REPORT_DATE") continue;
        data[date][k] = v as number | string | null;
      }
    }

    const sortedDates = Object.keys(data).sort((a, b) => b.localeCompare(a));
    const rows = sortedDates.map((date) => data[date]);

    await c.env.CACHE.put(cacheKey, JSON.stringify({ rows, data }), { expirationTtl: KV_TTL_SECONDS });
    c.header("X-Cache", "MISS");

    return c.json(
      ok({
        stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
        rows,
        count: rows.length,
      })
    );
  } catch (err) {
    console.error("EastMoney balance sheet failed:", err);
    throw new ApiError(503, "Financial data temporarily unavailable");
  }
});

// ---------------------------------------------------------------------------
// GET /api/financial/:ts_code/cash-flow — 现金流量表
// ---------------------------------------------------------------------------
app.get("/:ts_code/cash-flow", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  const cacheKey = `fin:cashflow:${ts_code}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json(ok({ stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name }, ...(cached as object) }));
  }

  try {
    const reports = await fetchFinancialReport(ts_code, "cash_flow");
    const data: Record<string, Record<string, number | string | null>> = {};
    for (const r of reports) {
      const date = r.REPORT_DATE;
      data[date] ??= { report_date: date };
      for (const [k, v] of Object.entries(r)) {
        if (k === "SECURITY_CODE" || k === "REPORT_DATE") continue;
        data[date][k] = v as number | string | null;
      }
    }

    const sortedDates = Object.keys(data).sort((a, b) => b.localeCompare(a));
    const rows = sortedDates.map((date) => data[date]);

    await c.env.CACHE.put(cacheKey, JSON.stringify({ rows, data }), { expirationTtl: KV_TTL_SECONDS });
    c.header("X-Cache", "MISS");

    return c.json(
      ok({
        stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
        rows,
        count: rows.length,
      })
    );
  } catch (err) {
    console.error("EastMoney cash flow failed:", err);
    throw new ApiError(503, "Financial data temporarily unavailable");
  }
});

// ---------------------------------------------------------------------------
// GET /api/financial/:ts_code/overview — 财务总览（PE/PB/ROE等关键指标）
// ---------------------------------------------------------------------------
app.get("/:ts_code/overview", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  const cacheKey = `fin:overview:${ts_code}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json(ok({ stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name }, ...(cached as object) }));
  }

  try {
    const indicator = await fetchLatestIndicator(ts_code);
    const key_metrics = indicator
      ? {
          basic_eps: { value: indicator.BASIC_EPS, unit: "元/股", report_date: indicator.REPORT_DATE },
          bps: { value: indicator.BPS, unit: "元/股", report_date: indicator.REPORT_DATE },
          roe_avg: { value: indicator.ROE_AVG, unit: "%", report_date: indicator.REPORT_DATE },
          pe_ttm: { value: indicator.PE_TTM, unit: "倍", report_date: indicator.REPORT_DATE },
          pb: { value: indicator.PB_LYR, unit: "倍", report_date: indicator.REPORT_DATE },
          yoygr: { value: indicator.YOYGR, unit: "%", report_date: indicator.REPORT_DATE },
          yoyni: { value: indicator.YOYNI, unit: "%", report_date: indicator.REPORT_DATE },
          debt_to_assets: { value: indicator.DEBT_TO_ASSETS, unit: "%", report_date: indicator.REPORT_DATE },
          total_operate_income: { value: indicator.TOTAL_OPERATE_INCOME, unit: "元", report_date: indicator.REPORT_DATE },
          net_profit: { value: indicator.NET_PROFIT, unit: "元", report_date: indicator.REPORT_DATE },
          total_assets: { value: indicator.TOTAL_ASSETS, unit: "元", report_date: indicator.REPORT_DATE },
          operate_cash_flow: { value: indicator.OPERATE_CASH_FLOW, unit: "元", report_date: indicator.REPORT_DATE },
        }
      : null;

    await c.env.CACHE.put(cacheKey, JSON.stringify({ key_metrics }), { expirationTtl: KV_TTL_SECONDS });
    c.header("X-Cache", "MISS");

    return c.json(
      ok({
        stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
        key_metrics,
      })
    );
  } catch (err) {
    console.error("EastMoney overview failed:", err);
    throw new ApiError(503, "Financial overview temporarily unavailable");
  }
});

// ---------------------------------------------------------------------------
// POST /api/financial/:ts_code/sync — 手动刷新（清除 KV 缓存，下次访问自动拉取）
// ---------------------------------------------------------------------------
app.post("/:ts_code/sync", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  await ensureStock(db, ts_code);

  // 清除所有相关缓存
  await Promise.all([
    c.env.CACHE.delete(`fin:indicator:${ts_code}`),
    c.env.CACHE.delete(`fin:income:${ts_code}`),
    c.env.CACHE.delete(`fin:balance:${ts_code}`),
    c.env.CACHE.delete(`fin:cashflow:${ts_code}`),
    c.env.CACHE.delete(`fin:overview:${ts_code}`),
  ]);

  return c.json(ok({ ts_code, message: "Cache cleared, next request will fetch fresh data" }));
});

export default app;
