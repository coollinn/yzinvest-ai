import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { predictions, stocks } from "../db/schema";
import { ApiError, ok } from "../lib/responses";
import { backtest, predictNextWeek } from "../services/prediction";
import {
  fetchFinancialIndicator,
  fetchFinancialReport,
  fetchKline,
} from "../services/eastmoney";
import { buildProviderConfig, createAIProvider } from "../services/ai-providers";
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

// ---------------------------------------------------------------------------
// POST /api/prediction/:ts_code/report — AI 智能研报（支持多 Provider）
// ---------------------------------------------------------------------------
app.post("/:ts_code/report", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);

  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) throw new ApiError(404, "Stock not found");

  // 初始化 AI Provider
  const providerConfig = buildProviderConfig(c.env);
  if (!providerConfig.apiKey && providerConfig.name !== "custom") {
    throw new ApiError(503, `AI provider ${providerConfig.name} API key not configured`);
  }
  const provider = createAIProvider(providerConfig);

  // 查缓存（24h）
  const cacheKey = `pred:report:${ts_code}:${providerConfig.name}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    return c.json(ok({ ts_code, source: "cache", provider: providerConfig.name, ...(cached as object) }));
  }

  // 并行获取：预测 + 财务指标 + 历史K线
  const [predResult, indicators, klines] = await Promise.all([
    predictNextWeek(c.env, ts_code, 5).catch(() => null),
    fetchFinancialIndicator(ts_code, 8).catch(() => []),
    fetchKline(ts_code, "101", undefined, undefined, 60).catch(() => []),
  ]);

  if (!predResult) throw new ApiError(503, "Not enough data for report");

  // 构建 prompt
  const latestIndicator = indicators[0];
  const prevIndicator = indicators[1];

  const klineSummary = klines.length > 0
    ? {
        latest_close: klines[klines.length - 1].close,
        high_30d: Math.max(...klines.slice(-30).map((k) => k.high)),
        low_30d: Math.min(...klines.slice(-30).map((k) => k.low)),
        avg_volume: klines.slice(-20).reduce((s, k) => s + k.volume, 0) / 20,
      }
    : null;

  const prompt = `你是一位资深 A 股分析师。请基于以下数据为「${stock.name}（${ts_code}）」撰写一份简短的智能研报（不超过 800 字）。

## 股票基本信息
- 名称：${stock.name}
- 代码：${ts_code}
- 行业：${stock.industry || "未分类"}

## 价格预测（AI 模型输出）
- 当前基准价：${predResult.base_price.toFixed(2)} 元
- 未来5日预测价：${predResult.predict_prices.map((p) => p.toFixed(2)).join(" → ")} 元
- 预测涨跌幅：${((predResult.predict_prices[predResult.predict_prices.length - 1] - predResult.base_price) / predResult.base_price * 100).toFixed(2)}%
- 置信度：${predResult.confidence}%
- 多空信号：${predResult.signal === "bull" ? "看涨" : predResult.signal === "bear" ? "看跌" : "震荡"}

## 技术指标
- MA5：${predResult.metrics.ma5.toFixed(2)}
- MA20：${predResult.metrics.ma20.toFixed(2)}
- RSI(14)：${predResult.metrics.rsi14.toFixed(2)}
- 布林带：${predResult.metrics.boll_lower.toFixed(2)} ~ ${predResult.metrics.boll_upper.toFixed(2)}
- 支撑位：${predResult.metrics.support_level.toFixed(2)}
- 阻力位：${predResult.metrics.resistance_level.toFixed(2)}
- 30日最大回撤：${predResult.metrics.max_drawdown_30d.toFixed(2)}%

## 财务指标
${latestIndicator
    ? `- 报告期：${latestIndicator.DATATYPE || latestIndicator.REPORT_DATE}
- 每股收益 EPS：${latestIndicator.BASIC_EPS?.toFixed(2) ?? "—"} 元
- 每股净资产 BPS：${latestIndicator.BPS?.toFixed(2) ?? "—"} 元
- 加权 ROE：${latestIndicator.WEIGHTAVG_ROE?.toFixed(2) ?? "—"}%
- 营收同比：${latestIndicator.YSTZ?.toFixed(2) ?? "—"}%
- 净利同比：${latestIndicator.SJLTZ?.toFixed(2) ?? "—"}%
- 毛利率：${latestIndicator.XSMLL?.toFixed(2) ?? "—"}%
- 最新股息率：${latestIndicator.ZXGXL?.toFixed(2) ?? "—"}%`
    : "暂无财务数据"}

${prevIndicator && latestIndicator
    ? `## 财务变化趋势
- 营收同比变化：${prevIndicator.YSTZ?.toFixed(2) ?? "—"}% → ${latestIndicator.YSTZ?.toFixed(2) ?? "—"}%
- 净利同比变化：${prevIndicator.SJLTZ?.toFixed(2) ?? "—"}% → ${latestIndicator.SJLTZ?.toFixed(2) ?? "—"}%`
    : ""}

${klineSummary
    ? `## 近期行情
- 最新收盘价：${klineSummary.latest_close.toFixed(2)} 元
- 30日高点：${klineSummary.high_30d.toFixed(2)} 元
- 30日低点：${klineSummary.low_30d.toFixed(2)} 元`
    : ""}

请按以下结构输出（使用 Markdown 格式）：

### 1. 投资要点（3-4 条 bullet points）
### 2. 技术面分析（简短）
### 3. 基本面分析（基于财务数据）
### 4. 风险提示（2-3 条）
### 5. 综合评级（强烈买入/买入/持有/减持，一句话说明理由）

注意：
- 语言简洁专业，不要堆砌数字
- 如果 RSI > 70 提醒超买风险，RSI < 30 提醒超卖机会
- 如果营收/净利同比大幅下滑需重点提示
- 不要给出具体买卖建议，仅作分析参考`;

  try {
    const reportText = await provider.generateReport(prompt);

    const result = {
      report: reportText,
      provider: providerConfig.name,
      model: providerConfig.model,
      generated_at: new Date().toISOString(),
    };

    // 缓存 24h
    await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 24 * 3600 });

    return c.json(ok({ ts_code, source: "ai", ...result }));
  } catch (err) {
    console.error("AI report generation failed:", err);
    throw new ApiError(503, `AI report generation failed: ${(err as Error).message}`);
  }
});

export default app;
