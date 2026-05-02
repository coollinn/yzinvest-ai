/**
 * AI 价格预测服务（纯算法，无外部 AI 调用）
 * 基于历史日K数据，综合运用均线、线性回归、RSI 等指标进行短期预测。
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { stockDaily, stocks } from "../db/schema";
import { fetchKline } from "./eastmoney";
import type { Env } from "../types";

export interface KlineInput {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface PredictionOutput {
  ts_code: string;
  base_price: number; // 预测基准价（最近收盘价）
  predict_dates: string[];
  predict_prices: number[];
  confidence: number; // 0-100
  signal: "bull" | "bear" | "neutral";
  metrics: {
    ma5: number;
    ma10: number;
    ma20: number;
    ma60: number;
    rsi14: number;
    boll_upper: number;
    boll_lower: number;
    trend_slope: number; // 线性回归斜率
    avg_daily_vol: number;
    recent_high: number;
    recent_low: number;
    max_drawdown_30d: number;
    volatility_20d: number; // 20日标准差
    support_level: number; // 最近30日低点
    resistance_level: number; // 最近30日高点
  };
  backtest?: {
    window_days: number;
    actual_prices: number[];
    predicted_prices: number[];
    mae: number; // 平均绝对误差
    rmse: number; // 均方根误差
    direction_accuracy: number; // 方向判断准确率 %
  };
}

function sma(values: number[], period: number): number {
  if (values.length < period) return 0;
  const subset = values.slice(-period);
  return subset.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0] ?? 0];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += -diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function linearRegressionSlope(y: number[]): number {
  const n = y.length;
  if (n < 2) return 0;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += y[i];
    sumXY += i * y[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  return Math.sqrt(sq / values.length);
}

function bollinger(closes: number[], period = 20, k = 2): { upper: number; lower: number } {
  const ma = sma(closes, period);
  const sd = stdDev(closes.slice(-period));
  return { upper: ma + k * sd, lower: ma - k * sd };
}

function nextTradingDays(count: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  while (dates.length < count) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      dates.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }
  }
  return dates;
}

/**
 * 获取历史 K 线数据（优先本地 DB，不足则 fallback 东方财富）
 */
async function getHistory(
  env: Env,
  ts_code: string,
  days: number
): Promise<KlineInput[]> {
  const db = createDb(env.DB);

  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const rows = await db
    .select()
    .from(stockDaily)
    .where(
      and(
        eq(stockDaily.ts_code, ts_code),
        gte(stockDaily.trade_date, fmt(start))
      )
    )
    .orderBy(sql`${stockDaily.trade_date}`);

  // 本地数据足够
  if (rows.length >= days * 0.5) {
    return rows.map((r) => ({
      date: r.trade_date,
      open: r.open ?? 0,
      high: r.high ?? 0,
      low: r.low ?? 0,
      close: r.close ?? 0,
      volume: r.vol ?? 0,
      amount: r.amount ?? 0,
    }));
  }

  // fallback 东方财富
  const klines = await fetchKline(ts_code, "101", fmt(start), fmt(today), 800);
  // 同时入库
  for (const row of klines) {
    await db
      .insert(stockDaily)
      .values({
        ts_code,
        trade_date: row.date.replace(/-/g, ""),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        pre_close: row.close - (row.price_change ?? 0),
        change: row.price_change ?? 0,
        pct_chg: row.pct_chg,
        vol: row.volume,
        amount: row.amount,
      })
      .onConflictDoUpdate({
        target: [stockDaily.ts_code, stockDaily.trade_date],
        set: {
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          pre_close: row.close - (row.price_change ?? 0),
          change: row.price_change ?? 0,
          pct_chg: row.pct_chg,
          vol: row.volume,
          amount: row.amount,
        },
      });
  }

  // 重新查本地
  const refreshed = await db
    .select()
    .from(stockDaily)
    .where(
      and(
        eq(stockDaily.ts_code, ts_code),
        gte(stockDaily.trade_date, fmt(start))
      )
    )
    .orderBy(sql`${stockDaily.trade_date}`);

  return refreshed.map((r) => ({
    date: r.trade_date,
    open: r.open ?? 0,
    high: r.high ?? 0,
    low: r.low ?? 0,
    close: r.close ?? 0,
    volume: r.vol ?? 0,
    amount: r.amount ?? 0,
  }));
}

/**
 * 预测未来 N 个交易日股价
 */
export async function predictNextWeek(
  env: Env,
  ts_code: string,
  horizon = 5
): Promise<PredictionOutput | null> {
  const db = createDb(env.DB);
  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) return null;

  // 获取至少 120 个交易日数据
  const history = await getHistory(env, ts_code, 180);
  if (history.length < 60) return null;

  const closes = history.map((h) => h.close);
  const lastClose = closes[closes.length - 1];

  // 技术指标
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const rsi14 = rsi(closes, 14);
  const { upper: bollUpper, lower: bollLower } = bollinger(closes, 20);
  const trendSlope = linearRegressionSlope(closes.slice(-30));
  const recent30 = closes.slice(-30);
  const avgVol =
    history.slice(-20).reduce((s, h) => s + h.volume, 0) / Math.min(20, history.length);
  const recentHigh = Math.max(...recent30);
  const recentLow = Math.min(...recent30);
  const vol20 = stdDev(closes.slice(-20));

  // 30日最大回撤
  let maxDrawdown = 0;
  let peak = closes[closes.length - 30];
  for (let i = closes.length - 30; i < closes.length; i++) {
    if (closes[i] > peak) peak = closes[i];
    const dd = (peak - closes[i]) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // --- 预测算法 ---
  // 1. 均线趋势得分
  let maScore = 0;
  if (ma5 > ma10) maScore += 1;
  if (ma10 > ma20) maScore += 1;
  if (ma20 > ma60) maScore += 1;
  if (lastClose > ma20) maScore += 1;

  // 2. 动量得分
  const momScore = trendSlope > 0 ? 1 : -1;

  // 3. RSI 得分（超买/超卖修正）
  let rsiScore = 0;
  if (rsi14 > 70) rsiScore = -1; // 超买
  else if (rsi14 < 30) rsiScore = 1; // 超卖
  else rsiScore = 0;

  // 4. 布林带得分
  let bollScore = 0;
  if (lastClose > bollUpper) bollScore = -0.5; // 触及上轨
  else if (lastClose < bollLower) bollScore = 0.5; // 触及下轨

  // 综合方向得分
  const totalScore = maScore * 0.35 + momScore * 0.25 + rsiScore * 0.2 + bollScore * 0.2;

  // 基于得分确定方向
  let signal: "bull" | "bear" | "neutral" = "neutral";
  if (totalScore > 0.5) signal = "bull";
  else if (totalScore < -0.5) signal = "bear";

  // 日均波动率
  const avgPctChg = vol20 / lastClose;

  // 逐日预测：趋势 + 波动 + 均值回归
  const predictPrices: number[] = [];
  let current = lastClose;
  const trendDaily = trendSlope * 0.5; // 半速跟随趋势

  for (let i = 0; i < horizon; i++) {
    // 趋势项
    const trendComp = trendDaily;
    // 均值回归项（向 ma20 回归）
    const meanRevComp = (ma20 - current) * 0.02;
    // 随机波动项
    const randomComp = (Math.random() - 0.5) * avgPctChg * current * 0.5;

    current = current + trendComp + meanRevComp + randomComp;
    // 限制在合理范围
    current = Math.max(current, recentLow * 0.95);
    current = Math.min(current, recentHigh * 1.05);
    predictPrices.push(Number(current.toFixed(2)));
  }

  // 置信度：综合指标一致性
  let confidence = 50;
  confidence += Math.abs(maScore) * 5; // 均线一致性
  confidence += Math.abs(rsiScore) * 8; // RSI 信号强度
  confidence -= maxDrawdown * 30; // 高回撤降低信心
  confidence += (1 - avgPctChg) * 10; // 低波动更可信
  confidence = Math.max(10, Math.min(95, Math.round(confidence)));

  const predictDates = nextTradingDays(horizon);

  return {
    ts_code,
    base_price: lastClose,
    predict_dates: predictDates,
    predict_prices: predictPrices,
    confidence,
    signal,
    metrics: {
      ma5: Number(ma5.toFixed(2)),
      ma10: Number(ma10.toFixed(2)),
      ma20: Number(ma20.toFixed(2)),
      ma60: Number(ma60.toFixed(2)),
      rsi14: Number(rsi14.toFixed(2)),
      boll_upper: Number(bollUpper.toFixed(2)),
      boll_lower: Number(bollLower.toFixed(2)),
      trend_slope: Number(trendSlope.toFixed(4)),
      avg_daily_vol: Number(avgVol.toFixed(0)),
      recent_high: Number(recentHigh.toFixed(2)),
      recent_low: Number(recentLow.toFixed(2)),
      max_drawdown_30d: Number((maxDrawdown * 100).toFixed(2)),
      volatility_20d: Number((vol20 / lastClose * 100).toFixed(2)),
      support_level: Number(recentLow.toFixed(2)),
      resistance_level: Number(recentHigh.toFixed(2)),
    },
  };
}

/**
 * 回测：用历史前 N 天的数据预测第 N+1 天，验证模型准确性
 */
export async function backtest(
  env: Env,
  ts_code: string,
  windowDays = 30
): Promise<PredictionOutput["backtest"] | null> {
  const db = createDb(env.DB);
  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) return null;

  const history = await getHistory(env, ts_code, 120);
  if (history.length < windowDays + 10) return null;

  const actualPrices: number[] = [];
  const predictedPrices: number[] = [];

  // 滑动窗口回测
  const step = Math.max(1, Math.floor(windowDays / 10));
  for (let i = windowDays; i < history.length - 1; i += step) {
    const window = history.slice(i - windowDays, i + 1);
    const closes = window.map((h) => h.close);
    const actual = window[window.length - 1].close;

    // 用窗口内前 N-1 天预测第 N 天（模拟）
    const subset = closes.slice(0, -1);
    const ma5 = sma(subset, 5);
    const ma20 = sma(subset, 20);
    const slope = linearRegressionSlope(subset.slice(-30));
    const pred = subset[subset.length - 1] + slope * 0.5 + (ma20 - subset[subset.length - 1]) * 0.02;

    actualPrices.push(actual);
    predictedPrices.push(Number(pred.toFixed(2)));
  }

  if (actualPrices.length === 0) return null;

  const n = actualPrices.length;
  const mae =
    actualPrices.reduce((s, a, i) => s + Math.abs(a - predictedPrices[i]), 0) / n;
  const rmse = Math.sqrt(
    actualPrices.reduce((s, a, i) => s + (a - predictedPrices[i]) ** 2, 0) / n
  );

  let correctDir = 0;
  for (let i = 1; i < n; i++) {
    const actualDir = actualPrices[i] > actualPrices[i - 1] ? 1 : -1;
    const predDir = predictedPrices[i] > predictedPrices[i - 1] ? 1 : -1;
    if (actualDir === predDir) correctDir++;
  }
  const dirAcc = n > 1 ? Math.round((correctDir / (n - 1)) * 100) : 0;

  return {
    window_days: windowDays,
    actual_prices: actualPrices,
    predicted_prices: predictedPrices,
    mae: Number(mae.toFixed(2)),
    rmse: Number(rmse.toFixed(2)),
    direction_accuracy: dirAcc,
  };
}
