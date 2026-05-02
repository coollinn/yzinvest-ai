import { LoginRequest, RegisterRequest } from "@yzinvest/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import {
  getExpiresAt,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import { ApiError, ok, readJson } from "../lib/responses";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.post(
  "/register",
  rateLimit({ windowSeconds: 3600, max: 10, prefix: "register" }),
  async (c) => {
    const body = RegisterRequest.parse(await readJson(c));
    const db = createDb(c.env.DB);

    const exists = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);
    if (exists.length) throw new ApiError(409, "Username already taken");

    const emailExists = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);
    if (emailExists.length) throw new ApiError(409, "Email already registered");

    const password_hash = await hashPassword(body.password);
    const [created] = await db
      .insert(users)
      .values({
        username: body.username,
        email: body.email,
        password_hash,
        full_name: body.full_name ?? null,
        role: "user",
      })
      .returning();

    const access_token = await signAccessToken(
      { id: created.id, username: created.username, role: created.role },
      c.env.JWT_SECRET
    );
    const refresh_token = await signRefreshToken(created.id, c.env.JWT_SECRET);

    return c.json(
      ok({
        access_token,
        refresh_token,
        expires_at: getExpiresAt(),
        user: {
          id: created.id,
          username: created.username,
          email: created.email,
          full_name: created.full_name,
          role: created.role,
          created_at: created.created_at,
          updated_at: created.updated_at,
        },
      })
    );
  }
);

app.post(
  "/login",
  rateLimit({ windowSeconds: 300, max: 10, prefix: "login" }),
  async (c) => {
    const body = LoginRequest.parse(await readJson(c));
    const db = createDb(c.env.DB);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);
    if (!user) throw new ApiError(401, "Invalid credentials");

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) throw new ApiError(401, "Invalid credentials");

    const access_token = await signAccessToken(
      { id: user.id, username: user.username, role: user.role },
      c.env.JWT_SECRET
    );
    const refresh_token = await signRefreshToken(user.id, c.env.JWT_SECRET);

    return c.json(
      ok({
        access_token,
        refresh_token,
        expires_at: getExpiresAt(),
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      })
    );
  }
);

app.post("/refresh", async (c) => {
  const body = await readJson<{ refresh_token: string }>(c);
  if (!body.refresh_token) throw new ApiError(400, "refresh_token required");

  let userId: number;
  try {
    userId = await verifyRefreshToken(body.refresh_token, c.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ApiError(401, "User no longer exists");

  const access_token = await signAccessToken(
    { id: user.id, username: user.username, role: user.role },
    c.env.JWT_SECRET
  );
  return c.json(ok({ access_token, expires_at: getExpiresAt() }));
});

app.get("/me", requireAuth, async (c) => {
  const sessionUser = c.get("user")!;
  const db = createDb(c.env.DB);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!user) throw new ApiError(401, "User no longer exists");
  return c.json(
    ok({
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
    })
  );
});

app.post("/change-password", requireAuth, async (c) => {
  const body = await readJson<{ old_password: string; new_password: string }>(c);
  if (!body?.old_password || !body?.new_password) {
    throw new ApiError(400, "old_password and new_password required");
  }
  if (body.new_password.length < 6) {
    throw new ApiError(400, "new_password must be at least 6 characters");
  }

  const user = c.get("user")!;
  const db = createDb(c.env.DB);

  const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!dbUser) throw new ApiError(404, "User not found");

  const valid = await verifyPassword(body.old_password, dbUser.password_hash);
  if (!valid) throw new ApiError(401, "Old password is incorrect");

  const newHash = await hashPassword(body.new_password);
  await db
    .update(users)
    .set({ password_hash: newHash, updated_at: new Date().toISOString() })
    .where(eq(users.id, user.id));

  return c.json(ok({ message: "Password changed successfully" }));
});

app.put("/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await readJson<{ full_name?: string; email?: string }>(c);
  const db = createDb(c.env.DB);

  const [existing] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!existing) throw new ApiError(404, "User not found");

  // 邮箱唯一性检查
  if (body.email && body.email !== existing.email) {
    const [dup] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (dup) throw new ApiError(409, "Email already in use");
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(body.full_name !== undefined ? { full_name: body.full_name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      updated_at: new Date().toISOString(),
    })
    .where(eq(users.id, user.id))
    .returning();

  return c.json(
    ok({
      id: updated.id,
      username: updated.username,
      email: updated.email,
      full_name: updated.full_name,
      role: updated.role,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    })
  );
});

app.post("/logout", requireAuth, async (c) => {
  // 无状态 JWT，前端清掉 token 即可。后续如需黑名单可走 KV。
  return c.json(ok({ message: "Logged out" }));
});

export default app;
