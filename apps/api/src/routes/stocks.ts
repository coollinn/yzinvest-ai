import { PaginationQuery } from "@yzinvest/shared";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createDb } from "../db/client";
import { financialData, stockDaily, stocks } from "../db/schema";
import { ApiError, ok, paginate } from "../lib/responses";
import type { Env, Variables } from "../types";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

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

app.get("/random", async (c) => {
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "100", 10)));
  const db = createDb(c.env.DB);
  // SQLite RANDOM() 在 D1 上可用
  const items = await db
    .select()
    .from(stocks)
    .orderBy(sql`RANDOM()`)
    .limit(limit);
  return c.json(ok({ items, count: items.length }));
});

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

app.get("/:identifier/detail", async (c) => {
  const db = createDb(c.env.DB);
  const stock = await loadStock(c, c.req.param("identifier"));

  const [latestDaily] = await db
    .select()
    .from(stockDaily)
    .where(eq(stockDaily.ts_code, stock.ts_code))
    .orderBy(desc(stockDaily.trade_date))
    .limit(1);

  const finCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(financialData)
    .where(eq(financialData.ts_code, stock.ts_code));

  return c.json(
    ok({
      stock,
      analysis_data: {
        current_price: latestDaily?.close ?? null,
        price_change: latestDaily?.change ?? null,
        pct_chg: latestDaily?.pct_chg ?? null,
        volume: latestDaily?.vol ?? null,
        high: latestDaily?.high ?? null,
        low: latestDaily?.low ?? null,
        open: latestDaily?.open ?? null,
        pre_close: latestDaily?.pre_close ?? null,
      },
      has_real_data: !!latestDaily,
      has_financial_data: Number(finCount[0]?.count ?? 0) > 0,
    })
  );
});

export default app;
