import { createMiddleware } from "hono/factory";
import { ApiError } from "../lib/responses";
import type { Env, Variables } from "../types";

interface RateLimitOptions {
  /** 时间窗口（秒） */
  windowSeconds: number;
  /** 窗口内允许的最大请求数 */
  max: number;
  /** key 前缀，用于区分不同的限流维度 */
  prefix: string;
  /** 取 key 的函数。默认按 IP */
  keyFn?: (c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) => string;
}

export function rateLimit(opts: RateLimitOptions) {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const key = opts.keyFn
      ? opts.keyFn(c as never)
      : c.req.header("CF-Connecting-IP") ?? "anon";
    const cacheKey = `rl:${opts.prefix}:${key}`;

    const raw = await c.env.CACHE.get(cacheKey);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= opts.max) {
      throw new ApiError(429, "Rate limit exceeded, please try again later");
    }

    // Write through with TTL = windowSeconds
    await c.env.CACHE.put(cacheKey, String(count + 1), {
      expirationTtl: opts.windowSeconds,
    });
    await next();
  });
}
