import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { syncStocks } from "./crons/sync-stocks";
import admin from "./routes/admin";
import auth from "./routes/auth";
import daily from "./routes/daily";
import favorites from "./routes/favorites";
import financial from "./routes/financial";
import notes from "./routes/notes";
import prediction from "./routes/prediction";
import stocks from "./routes/stocks";
import valuation from "./routes/valuation";
import type { Env, Variables } from "./types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", logger());

app.use("*", async (c, next) => {
  const allowed = (c.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (allowed.includes("*") || allowed.includes(origin)) return origin;
      return undefined;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid input", issues: err.issues } },
      422
    );
  }
  if (err instanceof HTTPException) {
    return c.json({ ok: false, error: { code: "HTTP_ERROR", message: err.message } }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
});

app.notFound((c) => {
  return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
});

app.get("/", (c) =>
  c.json({
    name: "yzinvest-ai-api",
    version: "2.0.0",
    docs: "https://github.com/yzinvest-ai",
  })
);
app.get("/health", (c) => c.json({ status: "healthy", timestamp: new Date().toISOString() }));

app.route("/api/auth", auth);
app.route("/api/stocks", stocks);
app.route("/api/daily", daily);
app.route("/api/financial", financial);
app.route("/api/notes", notes);
app.route("/api/favorites", favorites);
app.route("/api/valuation", valuation);
app.route("/api/prediction", prediction);
app.route("/api/admin", admin);

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Cron triggers — wrangler.toml 里配置的两个：
    //   30 8 * * *  (UTC 8:30  = 北京 16:30) 同步 stock_basic
    //   0 9 * * *   (UTC 9:00  = 北京 17:00) 暂未实现：增量日线，可在此添加
    ctx.waitUntil(syncStocks(env));
  },
} satisfies ExportedHandler<Env>;
