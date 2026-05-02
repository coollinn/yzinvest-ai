import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { predictions, stocks } from "../db/schema";
import { ApiError, ok } from "../lib/responses";
import { backtest, predictNextWeek } from "../services/prediction";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/prediction/:ts_code/next-week
app.get("/:ts_code/next-week", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);

  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");

  // 查缓存（6h）
  const cached = await c.env.CACHE.get(`pred:${ts_code}:week`, "json");
  if (cached) {
    return c.json(ok(cached as object));
  }

  const result = await predictNextWeek(c.env, ts_code, 5);
  if (!result) throw new ApiError(503, "Not enough historical data for prediction");

  // 缓存到 KV
  await c.env.CACHE.put(`pred:${ts_code}:week`, JSON.stringify(result), { expirationTtl: 6 * 3600 });

  // 同时入库
  await db.insert(predictions).values({
    ts_code,
    model_version: "v1",
    horizon_days: 5,
    predict_dates: result.predict_dates,
    predict_prices: result.predict_prices,
    confidence: result.confidence,
    signal: result.signal,
    metrics: result.metrics,
  }).onConflictDoNothing();

  return c.json(ok(result));
});

// GET /api/prediction/:ts_code/backtest
app.get("/:ts_code/backtest", async (c) => {
  const ts_code = c.req.param("ts_code");
  const windowDays = Math.min(60, Math.max(10, parseInt(c.req.query("window") ?? "30", 10)));

  const db = createDb(c.env.DB);
  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");

  const cached = await c.env.CACHE.get(`pred:${ts_code}:bt:${windowDays}`, "json");
  if (cached) return c.json(ok(cached as object));

  const result = await backtest(c.env, ts_code, windowDays);
  if (!result) throw new ApiError(503, "Not enough historical data for backtest");

  await c.env.CACHE.put(`pred:${ts_code}:bt:${windowDays}`, JSON.stringify(result), { expirationTtl: 12 * 3600 });
  return c.json(ok(result));
});

export default app;
