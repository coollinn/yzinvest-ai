import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../lib/jwt";
import { ApiError } from "../lib/responses";
import type { Env, Variables } from "../types";

export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication required");
  }
  const token = auth.slice(7);
  try {
    const user = await verifyAccessToken(token, c.env.JWT_SECRET);
    c.set("user", user);
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
  await next();
});

export const requireAdmin = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw new ApiError(401, "Authentication required");
  if (user.role !== "admin") throw new ApiError(403, "Admin access required");
  await next();
});

export const optionalAuth = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const user = await verifyAccessToken(auth.slice(7), c.env.JWT_SECRET);
      c.set("user", user);
    } catch {
      // ignore — auth is optional
    }
  }
  await next();
});
