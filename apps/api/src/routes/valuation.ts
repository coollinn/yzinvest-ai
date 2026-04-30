import { CAPMInputs, DCFInputs } from "@yzinvest/shared";
import { Hono } from "hono";
import { ok, readJson, sha256Hex } from "../lib/responses";
import { optionalAuth } from "../middleware/auth";
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

export default app;
