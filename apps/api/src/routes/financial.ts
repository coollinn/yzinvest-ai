import type { FinancialType } from "@yzinvest/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createDb } from "../db/client";
import { financialReports, stocks } from "../db/schema";
import { ApiError, ok } from "../lib/responses";
import {
  fetchFinancialIndicator,
  fetchFinancialReport,
  fetchLatestIndicator,
} from "../services/eastmoney";
import {
  fetchCninfoOrgId,
  fetchCninfoReports,
} from "../services/cninfo-reports";
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
          deduct_basic_eps: latest.DEDUCT_BASIC_EPS,
          bps: latest.BPS, // 每股净资产
          roe_avg: latest.WEIGHTAVG_ROE, // 加权ROE
          total_operate_income: latest.TOTAL_OPERATE_INCOME, // 营业总收入
          parent_netprofit: latest.PARENT_NETPROFIT, // 归母净利润
          yoy_revenue: latest.YSTZ, // 营收同比增长
          yoy_profit: latest.SJLTZ, // 净利同比增长
          mom_revenue: latest.YSHZ, // 营收环比增长
          mom_profit: latest.SJLHZ, // 净利环比增长
          gross_margin: latest.XSMLL, // 毛利率
          mgjyxjje: latest.MGJYXJJE, // 每股经营现金流
          zxgxl: latest.ZXGXL, // 最新股息率
          report_date: latest.REPORT_DATE,
          datatype: latest.DATATYPE,
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
      const date: string = r.REPORT_DATE as string;
      data[date] ??= { report_date: date };
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
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
      const date: string = r.REPORT_DATE as string;
      data[date] ??= { report_date: date };
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
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
      const date: string = r.REPORT_DATE as string;
      data[date] ??= { report_date: date };
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
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
          deduct_basic_eps: { value: indicator.DEDUCT_BASIC_EPS, unit: "元/股", report_date: indicator.REPORT_DATE },
          bps: { value: indicator.BPS, unit: "元/股", report_date: indicator.REPORT_DATE },
          roe_avg: { value: indicator.WEIGHTAVG_ROE, unit: "%", report_date: indicator.REPORT_DATE },
          total_operate_income: { value: indicator.TOTAL_OPERATE_INCOME, unit: "元", report_date: indicator.REPORT_DATE },
          parent_netprofit: { value: indicator.PARENT_NETPROFIT, unit: "元", report_date: indicator.REPORT_DATE },
          yoy_revenue: { value: indicator.YSTZ, unit: "%", report_date: indicator.REPORT_DATE },
          yoy_profit: { value: indicator.SJLTZ, unit: "%", report_date: indicator.REPORT_DATE },
          gross_margin: { value: indicator.XSMLL, unit: "%", report_date: indicator.REPORT_DATE },
          mgjyxjje: { value: indicator.MGJYXJJE, unit: "元/股", report_date: indicator.REPORT_DATE },
          zxgxl: { value: indicator.ZXGXL, unit: "%", report_date: indicator.REPORT_DATE },
          report_date: indicator.REPORT_DATE,
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

// ---------------------------------------------------------------------------
// GET /api/financial/:ts_code/reports — 财务报表 PDF 列表
// ---------------------------------------------------------------------------
app.get("/:ts_code/reports", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  const items = await db
    .select()
    .from(financialReports)
    .where(eq(financialReports.ts_code, ts_code))
    .orderBy(desc(financialReports.announcement_date));

  return c.json(
    ok({
      stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
      items,
      count: items.length,
      has_synced: items.length > 0,
    })
  );
});

// ---------------------------------------------------------------------------
// POST /api/financial/:ts_code/reports/sync — 从 cninfo 同步报表元数据
// ---------------------------------------------------------------------------
app.post("/:ts_code/reports/sync", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  const orgId = await fetchCninfoOrgId(stock.symbol);
  if (!orgId) throw new ApiError(404, "Cannot find orgId for this stock on cninfo");

  const reports = await fetchCninfoReports(stock.symbol, orgId, 100);
  let inserted = 0;

  for (const r of reports) {
    try {
      await db.insert(financialReports).values({
        ts_code,
        announcement_id: r.announcementId,
        title: r.title,
        report_type: r.reportType,
        report_period: r.reportPeriod,
        announcement_date: r.announcementTime,
        pdf_url: r.pdfUrl,
        file_size: r.fileSize,
      }).onConflictDoNothing({ target: financialReports.announcement_id });
      inserted++;
    } catch {
      // ignore duplicate
    }
  }

  return c.json(
    ok({
      ts_code,
      stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
      fetched: reports.length,
      inserted,
    })
  );
});

export default app;
