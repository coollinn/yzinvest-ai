import { NoteCreateRequest, NoteUpdateRequest, PaginationQuery } from "@yzinvest/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { notes } from "../db/schema";
import { ApiError, ok, paginate, readJson } from "../lib/responses";
import { requireAuth } from "../middleware/auth";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requireAuth);

app.get("/", async (c) => {
  const user = c.get("user")!;
  const { page, limit } = PaginationQuery.parse({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  const ts_code = c.req.query("ts_code");

  const db = createDb(c.env.DB);
  const where = ts_code
    ? and(eq(notes.user_id, user.id), eq(notes.ts_code, ts_code))
    : eq(notes.user_id, user.id);

  const totalRow = await db.select({ count: sql<number>`count(*)` }).from(notes).where(where);
  const total = Number(totalRow[0]?.count ?? 0);

  const items = await db
    .select()
    .from(notes)
    .where(where)
    .orderBy(desc(notes.updated_at))
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(ok({ items, pagination: paginate(total, page, limit) }));
});

app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = NoteCreateRequest.parse(await readJson(c));
  const db = createDb(c.env.DB);

  // 同一股票只允许一条 note，存在则更新
  const [existing] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.user_id, user.id), eq(notes.ts_code, body.ts_code)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(notes)
      .set({
        content: body.content,
        analysis_type: body.analysis_type ?? null,
        rating: body.rating ?? null,
        tags: body.tags ?? [],
        updated_at: new Date().toISOString(),
      })
      .where(eq(notes.id, existing.id))
      .returning();
    return c.json(ok(updated));
  }

  const [created] = await db
    .insert(notes)
    .values({
      user_id: user.id,
      ts_code: body.ts_code,
      content: body.content,
      analysis_type: body.analysis_type ?? null,
      rating: body.rating ?? null,
      tags: body.tags ?? [],
    })
    .returning();
  return c.json(ok(created));
});

app.get("/:id", async (c) => {
  const user = c.get("user")!;
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const db = createDb(c.env.DB);
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.user_id, user.id)))
    .limit(1);
  if (!note) throw new ApiError(404, "Note not found");
  return c.json(ok(note));
});

app.put("/:id", async (c) => {
  const user = c.get("user")!;
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const body = NoteUpdateRequest.parse(await readJson(c));
  const db = createDb(c.env.DB);
  const [updated] = await db
    .update(notes)
    .set({
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.analysis_type !== undefined ? { analysis_type: body.analysis_type } : {}),
      ...(body.rating !== undefined ? { rating: body.rating } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      updated_at: new Date().toISOString(),
    })
    .where(and(eq(notes.id, id), eq(notes.user_id, user.id)))
    .returning();
  if (!updated) throw new ApiError(404, "Note not found");
  return c.json(ok(updated));
});

app.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) throw new ApiError(400, "invalid id");

  const db = createDb(c.env.DB);
  const result = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.user_id, user.id)));
  return c.json(ok({ deleted: true }));
});

export default app;
