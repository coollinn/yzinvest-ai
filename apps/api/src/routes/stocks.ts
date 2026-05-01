import { PaginationQuery } from "@yzinvest/shared";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createDb } from "../db/client";
import { financialData, stockDaily, stocks } from "../db/schema";
import { ApiError, ok, paginate } from "../lib/responses";
import { fetchQuote, fetchQuotes, fetchStockList, tsCodeToSecid } from "../services/eastmoney";
import type { Env, Variables } from "../types";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ---------------------------------------------------------------------------
// GET /api/stocks         — 分页股票列表（本地数据库）
// ---------------------------------------------------------------------------
app.get("/", async (c) => {
  const { page, limit } = PaginationQuery.parse({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  const db = createDb(c.env.DB);

  const offset = (page - 1) * limit;
  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(stocks);
  const total = Number(totalRow[0]?.count ?? 0);

  const items = await db
    .select()
    .from(stocks)
    .orderBy(asc(stocks.ts_code))
    .limit(limit)
    .offset(offset);

  return c.json(ok({ items, pagination: paginate(total, page, limit) }));
});

// ---------------------------------------------------------------------------
// GET /api/stocks/list    — 东方财富实时行情列表（替代本地查询）
// ---------------------------------------------------------------------------
app.get("/list", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(c.req.query("pageSize") ?? "50", 10)));
  const sort = c.req.query("sort") ?? "pct_chg"; // pct_chg | amount | volume | market_cap
  const market = c.req.query("market") as "HS" | "SH" | "SZ" | "BJ" | "ZT" | undefined;

  // 排序字段映射
  const sortMap: Record<string, string> = {
    pct_chg: "f3",
    amount: "f20",
    volume: "f18",
    market_cap: "f23",
    current_price: "f4",
  };
  const fs = sortMap[sort] ?? "f3";

  const result = await fetchStockList(page, pageSize, market ?? "HS");

  return c.json(
    ok({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      sort,
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/stocks/search  — 本地数据库模糊搜索
// ---------------------------------------------------------------------------
app.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) throw new ApiError(400, "Query 'q' is required");
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));

  const db = createDb(c.env.DB);
  const pattern = `%${q}%`;
  const items = await db
    .select()
    .from(stocks)
    .where(
      or(
        like(stocks.symbol, pattern),
        like(stocks.name, pattern),
        like(stocks.cnspell, pattern),
        like(stocks.industry, pattern)
      )
    )
    .limit(limit);

  return c.json(ok({ items, count: items.length, query: q }));
});

// ---------------------------------------------------------------------------
// GET /api/stocks/random  — 随机股票
// ---------------------------------------------------------------------------
app.get("/random", async (c) => {
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "100", 10)));
  const db = createDb(c.env.DB);
  const items = await db
    .select()
    .from(stocks)
    .orderBy(sql`RANDOM()`)
    .limit(limit);
  return c.json(ok({ items, count: items.length }));
});

// ---------------------------------------------------------------------------
// GET /api/stocks/quotes  — 批量实时行情（东方财富）
// ---------------------------------------------------------------------------
app.get("/quotes", async (c) => {
  const q = c.req.query("ts_codes")?.trim();
  if (!q) throw new ApiError(400, "Query 'ts_codes' is required");
  const ts_codes = q.split(",").map((s) => s.trim()).filter(Boolean);
  if (ts_codes.length > 100) throw new ApiError(400, "最多支持 100 只股票");

  const quotes = await fetchQuotes(ts_codes);

  return c.json(
    ok({
      items: quotes,
      count: quotes.length,
      secids: ts_codes.map((c) => tsCodeToSecid(c)),
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/stocks/indices — 主要指数行情
// ---------------------------------------------------------------------------
app.get("/indices", async (c) => {
  const { fetchIndexQuotes } = await import("../services/eastmoney");
  const indices = await fetchIndexQuotes();
  return c.json(ok({ items: indices, count: indices.length }));
});

// ---------------------------------------------------------------------------
// GET /api/stocks/industries — 行业板块列表
// ---------------------------------------------------------------------------
app.get("/industries", async (c) => {
  const { fetchIndustryList } = await import("../services/eastmoney");
  const industries = await fetchIndustryList();
  return c.json(ok({ items: industries, count: industries.length }));
});

// ---------------------------------------------------------------------------
// GET /api/stocks/:identifier — 单只股票基本信息
// ---------------------------------------------------------------------------
async function loadStock(c: AppContext, identifier: string) {
  const db = createDb(c.env.DB);
  const isNumeric = /^\d+$/.test(identifier);
  const [stock] = isNumeric
    ? await db.select().from(stocks).where(eq(stocks.id, parseInt(identifier, 10))).limit(1)
    : await db.select().from(stocks).where(eq(stocks.ts_code, identifier)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");
  return stock;
}

app.get("/:identifier", async (c) => {
  const stock = await loadStock(c, c.req.param("identifier"));
  return c.json(ok({ stock }));
});

// ---------------------------------------------------------------------------
// GET /api/stocks/:identifier/detail — 股票详情（基础信息 + 最新行情 + 财务概况）
// ---------------------------------------------------------------------------
app.get("/:identifier/detail", async (c) => {
  const db = createDb(c.env.DB);
  const identifier = c.req.param("identifier");
  const stock = await loadStock(c, identifier);

  // 并行拉取：本地日线 + 东方财富实时行情 + 财务记录数
  const [latestDaily, quote, finCount] = await Promise.all([
    db
      .select()
      .from(stockDaily)
      .where(eq(stockDaily.ts_code, stock.ts_code))
      .orderBy(desc(stockDaily.trade_date))
      .limit(1)
      .then((r) => r[0] ?? null),
    fetchQuote(stock.ts_code).catch(() => null),
    db
      .select({ count: sql<number>`count(*)` })
      .from(financialData)
      .where(eq(financialData.ts_code, stock.ts_code)),
  ]);

  return c.json(
    ok({
      stock,
      quote, // 东方财富实时行情（最新）
      analysis_data: {
        current_price: latestDaily?.close ?? quote?.current_price ?? null,
        price_change: latestDaily?.change ?? quote?.price_change ?? null,
        pct_chg: latestDaily?.pct_chg ?? quote?.pct_chg ?? null,
        volume: latestDaily?.vol ?? quote?.volume ?? null,
        amount: latestDaily?.amount ?? quote?.amount ?? null,
        high: latestDaily?.high ?? quote?.high ?? null,
        low: latestDaily?.low ?? quote?.low ?? null,
        open: latestDaily?.open ?? quote?.open ?? null,
        pre_close: latestDaily?.pre_close ?? quote?.pre_close ?? null,
      },
      quote_source: quote ? "eastmoney" : "database",
      has_real_data: !!latestDaily || !!quote,
      has_financial_data: Number(finCount[0]?.count ?? 0) > 0,
      secid: tsCodeToSecid(stock.ts_code),
    })
  );
});

export default app;
