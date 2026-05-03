import { CAPMInputs, DCFInputs } from "@yzinvest/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { stocks } from "../db/schema";
import { eq } from "drizzle-orm";
import { ok, readJson, sha256Hex } from "../lib/responses";
import { optionalAuth } from "../middleware/auth";
import {
  fetchFinancialIndicator,
  fetchFinancialReport,
  fetchKline,
} from "../services/eastmoney";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", optionalAuth);

/**
 * 5 年预测 + 终值 DCF
 * 公式与旧 frontend/src/components/stock/AnalysisTools.vue:201-227 保持一致
 */
function calculateDCF(input: DCFInputs) {
  const { freeCashFlow, growthRate, discountRate, terminalGrowth } = input;
  const FORECAST_PERIOD = 5;
  let presentValue = 0;
  for (let i = 1; i <= FORECAST_PERIOD; i++) {
    const futureCashFlow = freeCashFlow * Math.pow(1 + growthRate / 100, i);
    const discountFactor = Math.pow(1 + discountRate / 100, i);
    presentValue += futureCashFlow / discountFactor;
  }
  const terminalValue =
    (freeCashFlow * Math.pow(1 + growthRate / 100, FORECAST_PERIOD + 1)) /
    (discountRate / 100 - terminalGrowth / 100);
  const terminalValuePresent =
    terminalValue / Math.pow(1 + discountRate / 100, FORECAST_PERIOD);
  const intrinsicValue = presentValue + terminalValuePresent;
  // 假设当前市值为 freeCashFlow 的 10 倍（与旧版一致；前端可调）
  const marginOfSafety = (intrinsicValue - freeCashFlow * 10) / (freeCashFlow * 10);
  return {
    intrinsicValue,
    marginOfSafety,
    presentValue,
    terminalValue: terminalValuePresent,
  };
}

function calculateCAPM(input: CAPMInputs) {
  const { riskFreeRate, marketReturn, beta } = input;
  const riskPremium = (marketReturn - riskFreeRate) / 100;
  const expectedReturn = riskFreeRate / 100 + beta * riskPremium;
  return { expectedReturn, riskPremium };
}

app.post("/:ts_code/dcf", async (c) => {
  const ts_code = c.req.param("ts_code");
  const input = DCFInputs.parse(await readJson(c));
  const result = calculateDCF(input);

  // 缓存（按参数 hash）
  const hash = await sha256Hex(JSON.stringify(input));
  const cacheKey = `val:dcf:${ts_code}:${hash}`;
  await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 6 * 3600 });

  return c.json(ok({ ts_code, type: "dcf", input, result }));
});

app.post("/:ts_code/capm", async (c) => {
  const ts_code = c.req.param("ts_code");
  const input = CAPMInputs.parse(await readJson(c));
  const result = calculateCAPM(input);
  const hash = await sha256Hex(JSON.stringify(input));
  const cacheKey = `val:capm:${ts_code}:${hash}`;
  await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 6 * 3600 });

  return c.json(ok({ ts_code, type: "capm", input, result }));
});

// ---------------------------------------------------------------------------
// GET /api/valuation/:ts_code/params — 从真实财务数据自动计算估值参数
// ---------------------------------------------------------------------------
app.get("/:ts_code/params", async (c) => {
  const ts_code = c.req.param("ts_code");
  const db = createDb(c.env.DB);

  const [stock] = await db.select().from(stocks).where(eq(stocks.ts_code, ts_code)).limit(1);
  if (!stock) return c.json(ok({ ts_code, error: "Stock not found" }), 404);

  const cacheKey = `val:params:${ts_code}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    return c.json(ok({ ts_code, source: "cache", ...(cached as object) }));
  }

  // 并行获取：财务指标 + 现金流量表 + 利润表
  const [indicators, cashflowReports, incomeReports] = await Promise.all([
    fetchFinancialIndicator(ts_code, 5),
    fetchFinancialReport(ts_code, "cash_flow"),
    fetchFinancialReport(ts_code, "income_statement"),
  ]);

  const latestIndicator = indicators[0] ?? null;

  // ---- DCF 参数 ----
  // 自由现金流：用经营活动现金流净额近似（元 → 万元）
  const latestCashflow = cashflowReports[0] as Record<string, unknown> | undefined;
  const netCashOperate = latestCashflow?.NETCASH_OPERATE
    ? Number(latestCashflow.NETCASH_OPERATE) / 10000
    : null;

  // 增长率：近3期营收复合增长率
  let revenueCagr: number | null = null;
  const revenues = (incomeReports as Array<Record<string, unknown>>)
    .map((r) => ({
      date: String(r.REPORT_DATE ?? "").substring(0, 10),
      value: r.TOTAL_OPERATE_INCOME ? Number(r.TOTAL_OPERATE_INCOME) : null,
    }))
    .filter((r) => r.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date)); // 升序

  if (revenues.length >= 2) {
    const first = revenues[0].value!;
    const last = revenues[revenues.length - 1].value!;
    const years = revenues.length / 4; // 近似年数（每季度一期）
    if (years > 0 && first > 0) {
      revenueCagr = (Math.pow(last / first, 1 / years) - 1) * 100;
    }
  }

  // 如果复合增长率计算失败，用最新的营收同比
  if (revenueCagr === null && latestIndicator?.YSTZ != null) {
    revenueCagr = latestIndicator.YSTZ;
  }

  // ---- 贝塔系数（简化版：用近30日个股与上证指数的相关性）----
  let beta = 1.0;
  try {
    const [stockKlines, indexKlines] = await Promise.all([
      fetchKline(ts_code, "101", undefined, undefined, 30),
      fetchKline("000001.SH", "101", undefined, undefined, 30),
    ]);

    if (stockKlines.length >= 10 && indexKlines.length >= 10) {
      // 计算每日收益率
      const stockReturns: number[] = [];
      const indexReturns: number[] = [];

      for (let i = 1; i < stockKlines.length; i++) {
        stockReturns.push((stockKlines[i].close - stockKlines[i - 1].close) / stockKlines[i - 1].close);
      }
      for (let i = 1; i < indexKlines.length; i++) {
        indexReturns.push((indexKlines[i].close - indexKlines[i - 1].close) / indexKlines[i - 1].close);
      }

      const n = Math.min(stockReturns.length, indexReturns.length);
      if (n >= 5) {
        const sR = stockReturns.slice(-n);
        const iR = indexReturns.slice(-n);

        const sMean = sR.reduce((a, b) => a + b, 0) / n;
        const iMean = iR.reduce((a, b) => a + b, 0) / n;

        let cov = 0;
        let iVar = 0;
        for (let i = 0; i < n; i++) {
          cov += (sR[i] - sMean) * (iR[i] - iMean);
          iVar += (iR[i] - iMean) ** 2;
        }
        cov /= n;
        iVar /= n;

        if (iVar > 0) {
          beta = Math.max(0.3, Math.min(2.5, cov / iVar));
        }
      }
    }
  } catch {
    // 计算失败用默认 1.0
  }

  const dcfDefaults = {
    freeCashFlow: netCashOperate ? Math.round(netCashOperate) : 10000,
    growthRate: revenueCagr != null ? Math.round(revenueCagr * 100) / 100 : 10,
    discountRate: 8,
    terminalGrowth: 2,
  };

  const capmDefaults = {
    riskFreeRate: 3,
    marketReturn: 10,
    beta: Math.round(beta * 100) / 100,
  };

  const result = {
    dcf_defaults: dcfDefaults,
    capm_defaults: capmDefaults,
    data_source: latestIndicator?.DATATYPE ?? "财务数据",
    report_date: latestIndicator?.REPORT_DATE ?? null,
    metrics: {
      net_cash_operate: netCashOperate,
      revenue_cagr: revenueCagr,
      roe: latestIndicator?.WEIGHTAVG_ROE,
      bps: latestIndicator?.BPS,
      eps: latestIndicator?.BASIC_EPS,
      beta,
    },
  };

  await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 12 * 3600 });

  return c.json(ok({ ts_code, source: "fresh", ...result }));
});

export default app;
