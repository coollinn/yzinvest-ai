import type { FinancialType } from "@yzinvest/shared";
import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createDb } from "../db/client";
import { financialData, stocks } from "../db/schema";
import { ApiError, ok } from "../lib/responses";
import { fetchCninfoFinancial } from "../services/cninfo";
import type { Env, Variables } from "../types";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const TYPES: FinancialType[] = [
  "balance_sheet",
  "income_statement",
  "cash_flow",
  "main_indicators",
];

const KEY_METRIC_NAMES = [
  "基本每股收益",
  "每股净资产",
  "净利润增长率",
  "营业总收入增长率",
  "加权净资产收益率",
];

const KV_TTL_SECONDS = 24 * 3600;

async function ensureStock(db: ReturnType<typeof createDb>, ts_code: string) {
  const [s] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!s) throw new ApiError(404, "Stock not found");
  return s;
}

async function syncOne(
  c: AppContext,
  ts_code: string,
  type: FinancialType
) {
  const records = await fetchCninfoFinancial(ts_code, type, c.env.CNINFO_COOKIE);
  const db = createDb(c.env.DB);
  for (const r of records) {
    await db
      .insert(financialData)
      .values({
        ts_code,
        report_type: r.report_type,
        report_date: r.report_date,
        financial_type: type,
        data_key: r.data_key,
        data_value: r.data_value,
        data_unit: "万元",
      })
      .onConflictDoUpdate({
        target: [
          financialData.ts_code,
          financialData.financial_type,
          financialData.report_type,
          financialData.report_date,
          financialData.data_key,
        ],
        set: { data_value: r.data_value },
      });
  }
  return records.length;
}

async function fetchOrganized(
  c: AppContext,
  ts_code: string,
  type: FinancialType
) {
  const cacheKey = `fin:${ts_code}:${type}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    c.header("X-Cache", "HIT");
    return cached;
  }

  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  let rows = await db
    .select()
    .from(financialData)
    .where(and(eq(financialData.ts_code, ts_code), eq(financialData.financial_type, type)));

  if (rows.length === 0) {
    // 首次访问触发 sync
    try {
      await syncOne(c, ts_code, type);
      rows = await db
        .select()
        .from(financialData)
        .where(and(eq(financialData.ts_code, ts_code), eq(financialData.financial_type, type)));
    } catch (err) {
      console.error("cninfo sync failed:", err);
      throw new ApiError(503, "Financial data temporarily unavailable");
    }
  }

  const data: Record<string, Record<string, Record<string, { value: number | null; unit: string | null }>>> = {};
  for (const r of rows) {
    data[r.report_type] ??= {};
    data[r.report_type][r.report_date] ??= {};
    data[r.report_type][r.report_date][r.data_key] = {
      value: r.data_value,
      unit: r.data_unit,
    };
  }
  const out = {
    stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
    financial_type: type,
    data,
  };
  await c.env.CACHE.put(cacheKey, JSON.stringify(out), { expirationTtl: KV_TTL_SECONDS });
  c.header("X-Cache", "MISS");
  return out;
}

for (const t of TYPES) {
  const slug = t.replace(/_/g, "-");
  app.get(`/:ts_code/${slug}`, async (c) => {
    const data = await fetchOrganized(c, c.req.param("ts_code"), t);
    return c.json(ok(data));
  });
}

app.get("/:ts_code/overview", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const stock = await ensureStock(db, ts_code);

  const indicators = await db
    .select()
    .from(financialData)
    .where(
      and(
        eq(financialData.ts_code, ts_code),
        eq(financialData.financial_type, "main_indicators")
      )
    );

  const key_metrics: Record<
    string,
    { value: number | null; unit: string | null; report_date: string }
  > = {};
  for (const ind of indicators) {
    if (KEY_METRIC_NAMES.includes(ind.data_key) && !key_metrics[ind.data_key]) {
      key_metrics[ind.data_key] = {
        value: ind.data_value,
        unit: ind.data_unit,
        report_date: ind.report_date,
      };
    }
  }

  return c.json(
    ok({
      stock: { ts_code: stock.ts_code, symbol: stock.symbol, name: stock.name },
      key_metrics,
    })
  );
});

app.post("/:ts_code/sync", async (c) => {
  const ts_code = c.req.param("ts_code");
  const type = (c.req.query("type") ?? "main_indicators") as FinancialType;
  if (!TYPES.includes(type)) throw new ApiError(400, "invalid type");

  const count = await syncOne(c, ts_code, type);
  // 清缓存
  await c.env.CACHE.delete(`fin:${ts_code}:${type}`);
  return c.json(ok({ ts_code, type, saved: count }));
});

export default app;
