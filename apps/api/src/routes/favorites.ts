import { FavoriteAddRequest, FavoriteReorderRequest } from "@yzinvest/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { favorites, stocks } from "../db/schema";
import { ApiError, ok, readJson } from "../lib/responses";
import { requireAuth } from "../middleware/auth";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requireAuth);

app.get("/", async (c) => {
  const user = c.get("user")!;
  const db = createDb(c.env.DB);
  const items = await db
    .select({
      id: favorites.id,
      ts_code: favorites.ts_code,
      sort_order: favorites.sort_order,
      created_at: favorites.created_at,
      stock: stocks,
    })
    .from(favorites)
    .leftJoin(stocks, eq(stocks.ts_code, favorites.ts_code))
    .where(eq(favorites.user_id, user.id))
    .orderBy(asc(favorites.sort_order), asc(favorites.created_at));
  return c.json(ok({ items }));
});

app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = FavoriteAddRequest.parse(await readJson(c));
  const db = createDb(c.env.DB);

  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, body.ts_code)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");

  // 取当前最大 sort_order
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
    .from(favorites)
    .where(eq(favorites.user_id, user.id));
  const nextOrder = Number(maxRow?.max ?? 0) + 1;

  try {
    const [created] = await db
      .insert(favorites)
      .values({ user_id: user.id, ts_code: body.ts_code, sort_order: nextOrder })
      .returning();
    return c.json(ok(created));
  } catch (err) {
    // 唯一约束冲突 = 已收藏
    throw new ApiError(409, "Already in favorites");
  }
});

app.delete("/:ts_code", async (c) => {
  const user = c.get("user")!;
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  await db
    .delete(favorites)
    .where(and(eq(favorites.user_id, user.id), eq(favorites.ts_code, ts_code)));
  return c.json(ok({ deleted: true }));
});

app.get("/:ts_code/check", async (c) => {
  const user = c.get("user")!;
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);
  const [row] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.user_id, user.id), eq(favorites.ts_code, ts_code)))
    .limit(1);
  return c.json(ok({ is_favorite: !!row }));
});

app.put("/reorder", async (c) => {
  const user = c.get("user")!;
  const body = FavoriteReorderRequest.parse(await readJson(c));
  const db = createDb(c.env.DB);

  for (let i = 0; i < body.order.length; i++) {
    await db
      .update(favorites)
      .set({ sort_order: i + 1 })
      .where(and(eq(favorites.user_id, user.id), eq(favorites.ts_code, body.order[i])));
  }
  return c.json(ok({ updated: body.order.length }));
});

export default app;
